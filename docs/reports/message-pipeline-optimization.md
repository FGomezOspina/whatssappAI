# Optimización del flujo de WhatsApp — 2 de octubre de 2026

## Resultado y alcance

Implementación local terminada y validada con 508 pruebas aprobadas. No se modificaron prompts, personalidad, catálogo ni criterios comerciales. No se agregaron dependencias, Redis, colas externas ni cancelaciones de solicitudes por mensajes nuevos. Los timeouts de red que ya existían se conservan.

El servidor local se reinició tras verificar ausencia de actividad reciente. `/health` devolvió `{"ok":true,"provider":"kapso"}`. Los cambios están activos en ese proceso; no se realizó un despliegue remoto.

La medición externa sintética quedó pendiente de autorización: la revisión automática rechazó enviar la consulta de Cutamycon y su contexto de catálogo a OpenAI porque la autorización anterior cubría NEXGARD. No se ejecutó esa prueba ni se enviaron mensajes de WhatsApp para medir. Por tanto, este informe no atribuye un cuello de botella a Supabase, OpenAI o Kapso sin evidencia.

## Funcionamiento anterior y actual

`inboundMessageBuffer.js` ya implementaba debounce real: un Map por canal/usuario, una lista de eventos y un timer que se cancelaba y reiniciaba con cada mensaje. Se conserva esa arquitectura. El valor encontrado en `.env` era **60000 ms**; ahora es **5000 ms**. El valor predeterminado también pasó a 5000 ms y sigue siendo configurable.

Antes, los lotes vencidos se encadenaban en una cola de promesas. Eso evitaba paralelismo por conversación, pero permitía enviar una respuesta antigua aunque hubieran llegado mensajes nuevos. Ahora un coordinador conserva el buffer existente y agrupa los lotes pendientes mientras hay una ejecución activa.

Cada mensaje recibido incrementa una generación por canal/usuario antes del primer `await`. Un webhook duplicado reconocido por su identificador estable no incrementa esa generación. Al iniciar una ejecución se toma una instantánea. Antes de enviar cada parte de la respuesta se compara con la generación actual. Si cambió, se descarta el texto pendiente.

Si llega otro mensaje durante Supabase, OpenAI o una tool, la operación actual termina normalmente; no se cancela. Sus efectos se guardan. Los mensajes nuevos se acumulan y luego se procesan contra el estado actualizado, sin volver a ejecutar los anteriores. El timer original continúa corriendo: si ya venció, el siguiente lote comienza inmediatamente; si no, espera solamente el tiempo restante. Dos clientes pueden procesarse simultáneamente; para la misma clave existe una sola ejecución activa.

Tras terminar un ciclo se eliminan el estado activo y el intervalo de typing. No queda una tarea esperando la próxima respuesta del cliente. Un mensaje cinco minutos después inicia un ciclo nuevo y recupera el contexto persistido.

## Typing y transporte

El coordinador llama a `mostrarEscribiendo` al comenzar el procesamiento, después del buffer y de comprobar la persistencia de entrada. El proveedor utiliza el SDK instalado, con `client.messages.markRead({phoneNumberId, messageId, typingIndicator: {type: 'text'}})`.

El typing se renueva cada 20 segundos mientras la ejecución está vigente, sin solicitudes de typing simultáneas. Su error se registra y nunca impide generar o enviar la respuesta. La petición no bloquea el motor. No se detecta ni simula el typing del cliente.

El envío valida vigencia también dentro de la división de textos largos del proveedor. Una petición HTTP que **ya se despachó** no puede retirarse: si el cliente escribe durante ese envío, no es posible garantizar que esa parte no llegue. Se detienen las partes siguientes. El historial conserva únicamente las partes cuyo envío confirmó el transporte, incluso ante un envío parcial.

## Persistencia e idempotencia

- **Lecturas:** cliente/configuración, conversación, historial, ejemplos y catálogo. Pueden repetirse sin duplicar pedidos.
- **Estado mutable:** el motor modifica carrito, selección, datos de entrega y confirmaciones. No se repasan los mensajes de la ejecución obsoleta; el siguiente ciclo recibe únicamente los nuevos.
- **Escrituras:** mensaje entrante, estado, pedido confirmado y captura de aprendizaje. Los mensajes usan un ID derivado de tenant/usuario/dirección/evento; los pedidos reutilizan `order_key` y el upsert existente; el aprendizaje ya utiliza un identificador estable.

Al recibir el webhook se inicia inmediatamente el guardado del mensaje. El 200 se devuelve tras completarlo; si falla se devuelve 503. El buffer empieza al recibirlo, sin sumar otra espera completa después del guardado.

Los recibos iniciales tienen `receiptOnly`; no se incorporan al historial del motor hasta que les corresponda procesarse. Así una consulta de historial del ciclo anterior no incorpora mensajes nuevos accidentalmente. Un recibo repetido no sobrescribe un registro ya enriquecido.

El carrito, los IDs procesados y la clave de confirmación se persisten antes del guardado del pedido. Si falla después, un reintento conserva la misma clave y no vuelve a sumar productos. El texto generado se guarda como salida solo después de confirmar el envío: una respuesta descartada no aparece falsamente como enviada ni reemplaza la última pregunta del asistente.

El bloqueo se libera en `finally`, también si fallan Supabase, OpenAI, tools, typing, envío o guardado de la salida. No se reintentan ciegamente envíos cuyo resultado puede ser ambiguo.

**Límites:** el coordinador es local a un proceso Node, igual que la cola anterior. No constituye un bloqueo distribuido entre réplicas. El buffer tampoco es una cola durable con recuperación automática tras caída del proceso. Se conservan los mecanismos actuales de deduplicación limitada y upsert; esto no equivale a una transacción distribuida ni a una garantía universal de entrega exactamente una vez.

## Instrumentación y tiempos

Los logs `[PERF][conversation:hash][run:uuid]` identifican la conversación sin mostrar el teléfono ni el cuerpo de los mensajes. Registran duración, éxito/error, número de llamada y tipo de operación. Los recibos tienen su propio contexto y sus mediciones se incorporan al resumen del lote que los procesa.

Se miden: guardado inmediato, buffer, espera de cola, contexto, búsqueda de productos, motor de pedidos, guardado de pedido, llamadas a OpenAI, peticiones lógicas e intentos HTTP de Supabase, typing/markRead, envío Kapso y guardado de respuesta. Las llamadas OpenAI distinguen routing, interpretación, humanización, respuesta de producto y transcripción. Los intentos internos del SDK OpenAI están incluidos en la duración de su llamada lógica, no contabilizados como nuevas llamadas del agente.

Cada resumen incluye número y duración acumulada por etapa, las tres consultas Supabase más lentas, hashes de consultas repetidas y total con/sin buffer. Cada consulta registra operación, proyección y cantidad de filas devueltas. La duración de la búsqueda incluye sus consultas; la de cada petición Supabase incluye sus reintentos. **No se deben sumar etapas anidadas ni paralelas para calcular el total de pared.** Typing es asíncrono: si termina después del resumen, su duración aparece en el log correlacionado posterior.

| Etapa | Tiempo real de servicio obtenido |
|---|---|
| Webhook | Pendiente de una entrega real instrumentada |
| Guardar mensaje | Pendiente |
| Buffer | Configurado a 5000 ms; comportamiento validado con reloj controlado, no medición de red |
| Contexto | Pendiente |
| Productos | Pendiente |
| OpenAI | Pendiente de autorización para la consulta sintética |
| Tools | Comportamiento probado localmente; duración real pendiente |
| Kapso send | No se ejecutó un envío real de prueba |
| TOTAL | No medido en un flujo externo completo |
| TOTAL SIN BUFFER | No medido en un flujo externo completo |

Número típico de consultas Supabase, top tres reales, número de llamadas OpenAI, tiempo total OpenAI/Supabase/Kapso y cuello de botella principal: **todavía no determinados**. Varían según número de productos, memoria histórica y ruta semántica. Las duraciones del runner de pruebas no representan latencia del servicio.

`scripts/measure-pipeline.js` prepara una consulta sintética con catálogo Supabase y OpenAI reales, sin guardar conversaciones/pedidos ni enviar WhatsApp. Cuando se autorice y ejecute, generará `docs/reports/pipeline-measurement.json`. Incluso entonces, sus datos no medirán persistencia de conversaciones, typing ni envío real: esos requieren observar un ciclo real autorizado.

## Auditoría estática de Supabase

1. `buscarConversacion` usa `select=*`. Conviene medir el tamaño real de `state` antes de limitar columnas; no se cambió sin verificar consumidores.
2. El historial reciente solicita hasta 60 filas y luego conserva aproximadamente 24000 caracteres. Conversaciones antiguas se resumen en páginas de 20, con lecturas, OpenAI y guardados secuenciales dependientes del cursor. Puede costar mucho más que un turno corto.
3. El store guarda mensajes en un ciclo secuencial al registrar el turno y al persistir su resultado. Con N mensajes hay escrituras proporcionales a N y upserts repetidos del estado/historial. Los IDs evitan filas duplicadas, pero no eliminan las peticiones HTTP repetidas. Es un patrón a medir antes de agrupar escrituras.
4. La búsqueda RPC limita resultados (20 por defecto, máximo 100). La recuperación de marcas aproximadas puede cargar hasta 1000 nombres y lanzar hasta tres búsquedas. Los logs ahora muestran cuántas filas devuelve cada petición.
5. La carga completa del catálogo hace marcas → referencias → presentaciones; esos niveles dependen de sus IDs. Dentro de cada nivel, los lotes ya se ejecutan con `Promise.all`, no una petición por producto.
6. Prompts/reglas de entrega ya se consultan en paralelo. La resolución del cliente al recibir y al procesar puede repetirse según caché y alcance: ahora queda visible en los hashes de consulta. No se añadió una caché que pueda mezclar tenants.
7. Los scripts SQL incluyen índices de cliente/usuario/fecha para mensajes, cursor de memoria, catálogo por marca/referencia, FTS y trigramas. Su existencia en archivos **no prueba** que estén instalados o usados en la base activa. Falta comprobar índices y `EXPLAIN ANALYZE` con consultas representativas antes de crear otros. No se ejecutaron migraciones.

## Pruebas

`npm test`: **508 aprobadas, 0 fallidas**. Los escenarios nuevos de concurrencia usan relojes controlados y servicios simulados para comprobar orden e invariantes sin escribir a clientes.

Cubren mensaje único; agrupación de tres mensajes; reinicio del debounce con intervalos de tres segundos; mensaje nuevo durante Supabase, OpenAI y lectura; tres mensajes mientras hay una ejecución; espera restante; lotes ya vencidos; clientes independientes; respuesta cinco minutos después; errores Supabase/OpenAI/write/Kapso; fallo de typing; webhook duplicado; efecto de escritura de un ciclo obsoleto sin reproducción; fallo y reintento del recibo; descarte de partes pendientes; historial de envío parcial; persistencia diferida de la respuesta; recibo y clave estable de pedido tras un fallo posterior. También pasan las regresiones comerciales existentes.

## Archivos modificados en esta implementación

- `.env` — buffer 5000 ms (archivo local ignorado por Git).
- `src/app.js` — integración del coordinador y confirmación del webhook tras persistir.
- `src/services/inboundMessageBuffer.js` — valor predeterminado 5000 ms.
- `src/services/conversationScheduler.js` — nuevo coordinador, vigencia, serialización y typing.
- `src/services/inboundMessagePersistence.js` — nuevo guardado inmediato.
- `src/services/pipelineTelemetry.js` — nueva instrumentación correlacionada.
- `src/providers/kapsoMessagingProvider.js` — typing oficial y control de partes enviadas.
- `src/conversation/conversationStore.js` — salida diferida y protección del recibo/pedido.
- `src/repositories/supabaseClient.js` — medición de peticiones, intentos y filas.
- `src/repositories/supabaseConversationRepository.js` — recibos e instrumentación de pedido.
- `src/services/aiInterpreter.js` — medición OpenAI.
- `src/services/humanizer.js` — medición OpenAI; conserva cambios previos del usuario.
- `src/services/mediaProcessor.js` — medición de transcripción.
- `src/services/catalogContextService.js` — medición de búsqueda.
- `src/services/conversationService.js` — medición de contexto/motor; conserva cambios previos del usuario.
- `test/inboundMessageBuffer.test.js` — expectativa del nuevo valor predeterminado.
- `test/conversationScheduler.test.js` — nuevas pruebas de concurrencia/transporte.
- `test/pipelinePersistence.test.js` — nuevas pruebas de persistencia/idempotencia.
- `scripts/measure-pipeline.js` — medición externa sintética pendiente de autorización.
- `docs/reports/message-pipeline-optimization.md` — este informe.

`.tmp/server-runtime.log` ya tenía cambios al comenzar y recibió la línea de arranque del servidor reiniciado; no es una modificación de lógica de esta entrega.

## Siguiente optimización, en orden de prioridad

1. Recoger ciclos reales instrumentados (consulta simple, lista y cierre de pedido); comparar mediana y p95, con/sin caché. Elegir la siguiente optimización según esas mediciones.
2. Si dominan las escrituras, agrupar upserts de mensajes por turno y eliminar persistencias repetidas, manteniendo recibos y clave de pedido.
3. Si domina el catálogo, revisar el plan del RPC, índices efectivamente instalados, filas y búsquedas repetidas; reducir trabajo sin perder coincidencias.
4. Si domina OpenAI, identificar la etapa concreta y llamadas adicionales por cobertura/historial; evaluar reducción con regresiones comerciales antes de cambiar modelos o prompts.
5. Si domina memoria histórica, optimizar la paginación/resumen incremental y tamaño recuperado, conservando la continuidad.
6. Antes de escalar a varios procesos o exigir recuperación automática tras caídas, diseñar coordinación y entrega durable. No se implementó ese cambio arquitectónico.
