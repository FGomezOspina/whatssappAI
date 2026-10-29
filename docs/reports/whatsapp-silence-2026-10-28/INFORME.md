# Incidente de silencio en Sandbox Kapso — 28 de octubre de 2026

**Actualización posterior autorizada:** se implementó continuidad comercial para derivaciones clínicas pendientes. El diagnóstico histórico de este documento sigue vigente; la política y el resultado actuales están en [commercial-followup.md](commercial-followup.md).

## Resultado

El último mensaje **sí llegó y sí se registró**. La causa demostrada del silencio es la pausa persistida de atención humana, activada por la consulta clínica anterior. No hay evidencia de pérdida en WhatsApp/Kapso, bloqueo del buffer ni error de generación/envío de ese turno. La rama de pausa termina antes de multimedia, OpenAI y búsqueda de catálogo.

El comportamiento coincide con la política previa documentada en `docs/reports/recognition-2026-10-28/INFORME.md`: un mensaje del cliente no levanta la pausa. La activación anterior fue coherente con una consulta de tratamiento. No se eliminó esa protección ni se cambió el estado productivo.

**La conversación real continúa en `pendiente_asesor`; no está desbloqueada ni se ha respondido retroactivamente.** Se corrigió un defecto de observabilidad: antes, el coordinador etiquetaba cualquier retorno `null` como `already_processed`, ocultando la diferencia entre pausa humana y duplicado. Este cambio no convierte una conversación pausada en una conversación automática.

## Evidencia y secuencia

Se usó la habilidad local `.agents/skills/observe-whatsapp/SKILL.md`, lectura de WhatsApp Web en Safari y GET autenticados a Kapso, Supabase y al inspector local de ngrok. Evidencia reducida en [evidence.json](evidence.json); no contiene claves ni cabeceras de autenticación.

Conversación de prueba: teléfono terminado en **4163**, hash de conversación Kapso `bd27f3a287d6`. Último mensaje: «y el tiene problemas urinarios, me recomendaron pro plan ur, cuanto cuesta?».

ID: `wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDYyMEQ0NzgxNkFGNEI0NUMyQwA=`. Hash del ID: `63c992f5c2f2`.

| Momento UTC / hora visible UTC−05 | Evidencia |
| --- | --- |
| 21:08:26 / 16:08:26 | Entrante: «Tengo un perrito de 8 anos y se rasca mucho, que le podría dar?» |
| 21:08:46.570 / 16:08:46.570 | `state.atencionHumana={estado:pendiente,motivo:criterio_veterinario}` |
| 21:08:48 / 16:08:48 | Kapso confirma saliente `sent`: consulta pendiente de asesor para orientación especializada. También existe fila outbound en Supabase. |
| 21:14:14 / 16:14:14 | Kapso recibe la pregunta por el precio de Pro Plan UR; WhatsApp Web muestra el mismo texto sin respuesta posterior. |
| 21:14:19 / 16:14:19 | ngrok recibe POST al webhook; el payload contiene el mismo message ID. Buffer de Kapso: 5.000 ms. |
| 21:14:21 / 16:14:21 | Kapso declara webhook `delivered`, `response_status=200`, `attempt_count=1`. ngrok confirma `200 OK`, duración aproximada 1,96 s. |
| 21:14:21.792 / 16:14:21.792 | Supabase crea fila inbound `97cd7d3d-8b7e-ee9f-05e6-50953cf09ba9`. |
| 21:14:25.649 / 16:14:25.649 | API de Kapso registra POST al endpoint de mensajes con HTTP 200. Ese endpoint sirve tanto para enviar como marcar leído: el listado muestra entrante `read`, sin nuevo saliente; el código inicia markRead/typing antes de evaluar la pausa. La atribución de esta llamada a markRead se infiere de esa combinación, no de un cuerpo HTTP capturado. |
| 21:14:25.882 / 16:14:25.882 | Supabase actualiza estado, conserva `pendiente_asesor`, incluye el message ID en `mensajesProcesados` y conserva dos líneas de carrito. |

La cola local utiliza otros 5.000 ms de debounce por defecto, compatible con estos tiempos. El mensaje no pasó por router/modelo/catálogo: la pausa devuelve `null` antes de esas operaciones. No hay nuevo saliente a confirmar, por lo que el HTTP 200 del webhook no debe interpretarse como confirmación de una respuesta enviada.

`processing_status=pending` en los mensajes de Kapso tampoco demuestra un bloqueo del agente: aparece igualmente en los entrantes anteriores que sí obtuvieron respuesta.

## Terminal y proceso activo

- Se comprobó `node server.js`, PID 85381, iniciado a las 15:53:13 (hora del Mac), y `ngrok http 3000`, PID 58173, desde las 09:49:11.
- No hay watch/reload en el comando activo; los cambios de esta revisión permanecen en disco y no están cargados en ese proceso. No se reinició ni detuvo ningún proceso.
- `.tmp/server-runtime.log` existe pero tiene cero bytes. El terminal propio de esta tarea no tiene sesión asociada.
- Se pudo observar una captura del terminal de VS Code: consultas a `rpc/search_catalog_products` con `ok:true` del run `e6f5ffec-b7ba-40a7-a7e6-b58906b8811c`. La captura estaba desplazada y **no mostró la excepción mencionada por el usuario**.
- No se logró acceder al scrollback completo mediante la herramienta local: acciones sobre la ventana devolvieron `noWindowsAvailable` y posteriormente la captura no estaba disponible. No se atribuye un error desconocido a este mensaje. Para cerrar ese punto se necesita el texto concreto del error o una vista accesible del final del terminal.
- Las fuentes persistidas sí permiten demostrar la pausa y la recepción de este mensaje sin inventar una excepción.

## Cambios locales de esta revisión

1. `src/services/conversationService.js`: comunica el motivo de omisión al contexto de telemetría (`already_processed` o `human_handoff`, con estado y motivo de derivación). Mantiene el contrato `null` y la política de pausa.
2. `src/services/conversationScheduler.js`: registra la razón real, hash del identificador entrante, resultado de envío/reemplazo/fallo y etapa del fallo. Distingue persistencia de una respuesta ya enviada de un fallo de envío; registra cuántas partes se confirmaron. No imprime el error HTTP crudo ni credenciales. No añade reintentos, respuestas genéricas ni cambios al buffer.
3. `src/services/pipelineTelemetry.js`: incluye `outcome` en el resumen de ejecución.
4. `test/contextualHandoff.test.js`: reproduce el último texto con estado mínimo sintético, pausa pendiente/en atención, preservación del carrito, ausencia de llamadas a IA y diferenciación de duplicados.
5. `test/conversationScheduler.test.js`: regresiones sobre trazabilidad, mensajes en cola durante fallos simulados de OpenAI/Supabase/Kapso, reentrega, envío incierto, guardado posterior al envío y redacción de errores.

Los cambios de cierre de pedidos que ya estaban sin commit se conservaron; aparecen también en el diff global pero no pertenecen a esta revisión. No se modificaron `.env`, modelos, catálogo, proveedor Kapso, reglas de carrito ni estructura/consultas de Supabase.

## Pruebas

- Baseline: **941/941** pruebas pasan antes de esta revisión.
- Suite final: **950/950** pasan; cero fallos, canceladas u omitidas.
- Regresión específica: el texto del incidente con atención humana activa se guarda, no llama a OpenAI/catálogo y conserva el carrito; se identifica como pausa, no como duplicado. Repetir el mismo ID se identifica como duplicado.
- Suite existente y nuevas pruebas cubren debounce, ráfagas, mensajes durante procesamiento, aislamiento por empresa/conversación, pausa tras recrear el motor, guardado inbound fallido y reentrega, descarte de respuestas obsoletas y guardado de partes confirmadas.
- Los fallos simulados liberan el lock y permiten procesar una sola vez los mensajes que ya estaban esperando. Un envío incierto no se reintenta automáticamente a ciegas.
- Ninguna prueba llamó al modelo real, envió WhatsApp, creó pedidos ni escribió en servicios remotos.

Archivos de salida: [tests.before.txt](tests.before.txt), [tests.after.txt](tests.after.txt). `git diff --check` limpio.

## Límites y decisión pendiente

1. La pausa es intencional, pero no hay panel ni asignación/notificación de asesores: guardar `pendiente_asesor` no constituye una atención humana efectiva. Esto explica por qué el usuario queda esperando aunque el pipeline técnico funcione.
2. Mantener esa regla implica que también se silencian preguntas comerciales posteriores. Para cambiarlo hace falta definir la política: cierre explícito por operador, o permitir consultas comerciales mientras la consulta clínica sigue pendiente. No se hizo una reanudación automática ni una escritura productiva.
3. No se afirma entrega exactamente una vez ni recuperación automática de todo mensaje fallido. La arquitectura actual no tiene outbox duradero/reconciliación para envíos ambiguos y los tests solo prueban recuperación del siguiente lote y supresión de duplicados en los escenarios descritos. Reejecutar a ciegas podría duplicar efectos de carrito o mensajes.
4. Pendiente: leer la excepción exacta del terminal y, después de aprobar cualquier cambio de política y carga del código, realizar prueba E2E limitada en Sandbox. No se pidió ni realizó reinicio/despliegue durante este diagnóstico.

## Permisos de investigación

Las consultas de procesos y las lecturas de red requirieron escalación porque el entorno restringía `ps` y DNS. Las escalaciones solicitadas se completaron; no hubo denegación de revisión automática ni quedó aprobación pendiente. Los intentos iniciales restringidos fallaron antes de leer servicios (`operation not permitted`, `ENOTFOUND`). El acceso UI al scrollback es una limitación técnica, no una denegación de aprobación.
