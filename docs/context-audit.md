# Auditoria De Contexto Conversacional

Ultima revision: 2026-09-10.

Esta auditoria describe como se usa memoria, historial, catalogo y presupuesto de IA. Es un documento de soporte; la arquitectura general vive en `docs/project-context.md`.

## Fuentes De Memoria

### `whatsapp_conversations`

Se consulta por `client_id + channel_user_id`. La columna `state` conserva memoria estructurada:

- carrito;
- productos consultados;
- ultima seleccion;
- coincidencias o presentaciones pendientes;
- entrega, direccion y metodo de pago;
- banderas de pregunta pendiente;
- ultimo pedido confirmado.

El estado se vuelve a cargar desde Supabase al comenzar cada turno. La cache local no sustituye esa lectura. `ultimaPreguntaAsistente` conserva la ultima respuesta operativa y `memoriaConversacional` conserva el resumen historico con cursor `(created_at, id)`. Si falla la lectura del estado o del historial, se propaga el error; no se continua con memoria vacia.

### `whatsapp_messages`

Cada turno conserva:

1. Cada mensaje inbound original, antes de procesar multimedia o llamar al interprete.
2. Su `metadata`: identificador del evento, tipo, media ID, transcripcion y la interpretacion del turno al que pertenece. Los mensajes agrupados comparten `turnId`; no se atribuye a una sola foto la interpretacion de todo el lote. No se guardan URLs firmadas ni base64.
3. La respuesta outbound antes de enviarla por Kapso.

El historial se filtra por `client_id + channel_user_id`, la misma identidad usada en el upsert de conversacion. No hay filtro por antiguedad. Se ordena por `created_at` e `id`; las paginas recientes se invierten para enviarlas cronologicamente. Los roles inbound/outbound se convierten a cliente/asistente. El numero del canal identifica al tenant y `message.from` identifica al usuario. Se conservan los fallbacks existentes (`from_user_id`, telefono o IDs de la conversacion Kapso) sin renombrar claves historicas.

El turno actual se excluye de la consulta historica porque se envia por separado al interprete. IDs deterministas por tenant, usuario, canal, evento y direccion permiten actualizar evidencia sin duplicar la entrada. La idempotencia distribuida del procesamiento sigue pendiente; esto evita duplicados del registro, no ofrece locks entre instancias.

## Recuperacion y resumen persistente

El router recibe hasta 60 mensajes recientes completos, con un presupuesto de 24000 caracteres de registros. Conserva al menos los dos ultimos registros incluso ante mensajes largos. Las conversaciones cortas entran completas; el constructor ya no recorta cada cuerpo a 500 caracteres ni elimina mensajes del router por el presupuesto de perfiles antiguos.

Lo anterior a esa ventana se recorre en Supabase por paginas ascendentes de 20 registros, usando cursores compuestos para no saltar mensajes con la misma fecha. El interprete resume cada pagina junto al resumen anterior y persiste el resultado en `state.memoriaConversacional`. Conserva producto, presentacion, cantidades, preferencias, restricciones, correcciones, intencion y datos del pedido, diferenciando hipotesis de hechos. No convierte precios antiguos en precios vigentes.

El primer turno de una conversacion con un archivo largo puede requerir varias llamadas para construir ese resumen. Se guarda progreso despues de cada pagina; los siguientes turnos procesan solo lo nuevo que sale de la ventana reciente. No se elimina ni modifica el historial original. Las fases posteriores reciben estado, resumen y la pregunta anterior, y conservan como minimo los dos ultimos mensajes al ajustar presupuesto. La consulta semantica resuelta se usa tambien al validar respuestas cortas, aunque haya expirado una seleccion temporal.

Aplicar `supabase/008_conversation_memory.sql` antes de ejecutar esta version contra una base existente. Agrega `whatsapp_messages.metadata` y un indice de paginacion; el esquema nuevo ya incluye la columna. Los mensajes antiguos siguen disponibles, pero no se puede reconstruir evidencia multimedia que nunca fue almacenada.

Verificacion del 2026-09-10: migracion 008 aplicada al proyecto configurado localmente. Las consultas REST reales aceptaron metadata, orden y ambos cursores de paginacion. La tabla configurada no devolvio mensajes; por eso la continuidad se verifico con pruebas de integracion y Supabase simulado, no con una conversacion real de WhatsApp. Pasaron las 297 pruebas y el backend actualizado respondio correctamente en `/health`.

## Contexto en fases posteriores al router

El router utiliza la recuperacion y el resumen descritos arriba. En las fases posteriores, los limites cuentan mensajes individuales, no pares completos cliente-asistente.

| Perfil | Uso de historial |
| --- | --- |
| `simple` | Normalmente cero. |
| `producto` | Contexto resuelto por el router y al menos los dos ultimos mensajes si hay historial. |
| `pedido` | Historial reciente limitado. |
| `multimedia` imagen | Historial disponible, solicitud resuelta y foco anterior limpiado al mapear candidatos. |
| `multimedia` audio | Historial reciente limitado. |
| `complejo` | Contexto ampliado dentro de presupuesto. |

Riesgo: un limite de tres mensajes no equivale a tres turnos completos.

## Payload Del Interprete

OpenAI recibe:

1. `system`: prompt de perfil, esquema JSON y reglas de cliente/vertical.
2. `user`: JSON compacto con mensaje actual, intencion detectada, cliente, estado operativo, historial reciente, ejemplos y candidatos de catalogo.

Antes de construir el payload:

- `interactionClassifier` define perfil, modelos y limites.
- `catalogContextService` recupera candidatos FTS/RPC y fuzzy local.
- `productMatchValidator` hace una validacion previa; si detecta consulta generica o de categoria sin marca explicita, puede dejar que el motor de la vertical responda sin llamar al interprete.
- `contextBuilder` reduce bloques si se supera presupuesto.

Orden de reduccion:

1. ejemplos;
2. historial mas antiguo;
3. descripciones largas;
4. candidatos adicionales;
5. memoria no activa en perfil producto.

El catalogo completo no se envia a OpenAI, pero queda disponible para validacion backend.

## Payload Del Humanizador

El humanizador recibe:

- intencion y accion interpretadas;
- producto o carrito relevante;
- estado operativo compacto;
- mensaje actual recortado;
- respuesta operativa ya decidida.

No recibe historial completo. La respuesta operativa conserva los hechos; el humanizador solo mejora tono.

## Resolucion De Referencias Cortas

Se resuelven primero desde estado:

- `si`, `ese`, `esa`, `el primero`: coincidencias o selecciones pendientes;
- pesos: `ultimaSeleccion`, `referenciasPendientes` o productos consultados;
- entrega/pago: banderas `esperando*`;
- repeticion de pedido: snapshot de ultimo pedido confirmado.

Esto ahorra tokens y evita pedir al modelo reconstruir hechos comerciales desde texto libre.

## Imagenes

El router semantico recibe el mensaje completo y contexto reciente antes de limpiar el foco temporal. Decide si hay una intencion previa vigente aplicable a la imagen; un carrito o una foto anterior no bastan para reutilizar atributos. La fase posterior limpia el foco de productos anteriores, conservando la solicitud resuelta y los datos operativos.

Actualizacion del flujo visual (2026-09-10): cada producto separa `observado` (nombre, presentacion y confianza por atributo) de `solicitud` (presentacion y cantidad pedidas por texto o contexto vigente). `productEvidenceService` resuelve la prioridad texto explicito > intencion previa vigente > evidencia visual confiable. La cantidad cuenta paquetes; la presentacion describe su contenido. El peso visual requiere confianza de al menos 0.85 y nunca se completa desde candidatos del catalogo.

La busqueda usa la presentacion resuelta, sin arrastrar el peso crudo del OCR. Una segunda lectura puede mejorar evidencia visual, pero conserva la solicitud del router. Una identidad visual exacta suficientemente confiable limita las referencias antes de agrupar similitudes; si hay ambiguedad, se muestran candidatos cercanos sin precios. Si el producto esta validado pero falta presentacion, el motor conserva la seleccion y pregunta solo ese dato, incluso si Supabase devuelve una unica presentacion. Aclarar la presentacion conserva la intencion de consulta y no autoriza agregar al carrito.

Correccion verificada el 2026-09-12: la identidad visual normaliza abreviaturas de etapa y admite un sabor visible omitido por el nombre comercial, sin admitir palabras de variantes no observadas. La consolidacion conserva todos los aliases y respeta `metadata.equivalent_references` dentro de la misma marca y categoria/especie compatibles. Las equivalencias comerciales se declaran en los datos; no se deducen de compartir marca o peso. La equivalencia RINGO ADUL/CROQUETA/CROQUETAS, confirmada por el propietario, quedo registrada en Supabase y `productos.json`, junto a sus aliases de empaque.

Se verifico el recorrido real de recuperacion de candidatos en Supabase, validacion y construccion de respuesta con identidades estructuradas: RINGO ADULTOS 2kg devuelve solo RINGO CROQUETAS 2kg ($10.900); CHUNKY ADULTOS POLLO 2kg devuelve solo CHUNKY ADULTO 2kg ($18.900). Esta comprobacion no envia WhatsApp ni ejecuta una nueva lectura de imagen en OpenAI. La suite de 299 pruebas incluye continuidad por peso y distincion de variantes visuales.

La lectura visual extrae marca, linea/variante, especie, etapa, tamano, condicion, presentacion, sabor y texto visible. Una marca sola no confirma una referencia. Si la primera lectura omite una senal critica o deja ambiguedad real, puede ejecutarse una segunda lectura enfocada con candidatos refinados.

`AI_VISION_REFINEMENT=false` desactiva esa segunda llamada.

## Matching

`productMatchValidator` compara interpretacion contra:

- marca y referencia;
- descripcion;
- aliases;
- `metadata.original_names`;
- referencias equivalentes;
- categoria, subcategoria, especie, etapa, tamano, condicion y sabor;
- presentaciones disponibles;
- disponibilidad basica de presentaciones cuando `stock` viene en catalogo;
- errores de escritura tolerables.

`catalogConsolidationService` agrupa typos compatibles y fusiona presentaciones. No contiene excepciones por producto.

Las consultas por familias como medicamentos, antipulgas, desparasitantes, snacks, juguetes, accesorios o arena se tratan como busquedas de categoria/subcategoria. El sistema debe conservar esos criterios sin convertirlos en una marca desconocida ni arrastrar una referencia pendiente de comida.

## Casos que no requieren una llamada posterior al router

- Saludo simple.
- Consulta nueva y explicita de producto.
- Seleccion determinista de una coincidencia pendiente.
- Validacion temprana de catalogo.
- Humanizador.
- Imagen nueva.
- Consulta exploratoria de categoria con validacion suficiente.

El router ya recibio la memoria de Supabase. Varios casos posteriores se resuelven con estado y catalogo sin pedir al modelo que reconstruya otra vez la conversacion.

## Riesgos Detectados

1. El resumen es una compresion semantica; el archivo original completo sigue en Supabase.
2. La recarga de estado evita usar cache obsoleta, pero varias instancias aun necesitan locks compartidos.
3. Estado y mensajes no se escriben en una unica transaccion; los errores se propagan y los eventos conservan IDs estables para reintentar.
4. Imagenes y audios conservan metadata e interpretacion del turno; el archivo original no queda en historial.
5. La consolidacion fuzzy debe monitorearse para no unir referencias comercialmente distintas.
6. La segunda lectura visual mejora precision, pero agrega costo en casos ambiguos.

## Logs De Diagnostico

Activar solo temporalmente:

```env
AI_CONTEXT_PAYLOAD_LOGS=true
PRODUCT_CONTEXT_LOGS=true
AI_CONTEXT_LOGS=true
AI_USAGE_LOGS=true
```

Logs utiles:

- `[AI Context Retrieval]`: historial recuperado y limites.
- `[AI Context Payload]`: payload final hacia OpenAI.
- `[Product Context]`: fuente de resolucion de productos.
- `[Catalog Search]`: estrategia, query y candidatos.
- `[OpenAI] Revision visual`: lectura inicial/refinada/elegida.

Estos logs pueden contener mensajes, direcciones y datos personales. No deben quedar activos en produccion.

## Mejoras Propuestas

1. Evaluar fidelidad del resumen con conversaciones largas reales.
2. Proteger turnos completos de varios mensajes cuando haya lotes grandes.
3. Revisar locking y transacciones para despliegue horizontal.
5. Medir falsos positivos de vision y consolidacion.
6. Evaluar embeddings por cliente solo si FTS + fuzzy no alcanza con casos reales.

Descarga multimedia: `mediaProcessor` aplica `MEDIA_DOWNLOAD_TIMEOUT_MS` (30.000 ms por defecto) a cabeceras y cuerpo completo, con `MEDIA_DOWNLOAD_RETRIES=1` por defecto (un reintento). Solo reintenta timeout, errores transitorios de red y HTTP 408/429/5xx; no reintenta rechazo de acceso ni exceso del limite de bytes. Cada intento usa su propio AbortController y descarta datos parciales. Los logs indican fase de descarga, plazo, intento y duracion sin revelar la URL firmada. El registro previo a descargar ya no afirma que OpenAI recibio la imagen. La configuracion local de 10.000 ms se actualizo a 30.000 ms.

Correccion de identidad tras lectura visual: con evidencia de nombre >= 0.85, el validador puntua el nombre observado y excluye el OCR publicitario y las lineas propuestas no contenidas en esa identidad. Antes se puntuaba primero la referencia sugerida por el modelo y se filtraban candidatos antes de comprobar la identidad observada; eso permitia validar una linea distinta aun con lectura correcta. Se reprodujo el turno real guardado (Ringo Original Adultos, confianza 0.96): paso de RINGO VITALITY ADULTO a RINGO CROQUETAS, sin inventar peso. Prueba de regresion con otra marca y suite completa: 303 pruebas aprobadas.
