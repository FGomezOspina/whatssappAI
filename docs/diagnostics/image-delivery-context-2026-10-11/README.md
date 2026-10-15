# Imágenes omitidas cuando el texto trata sobre entrega y pago

## Diagnóstico

Las dos imágenes llegan al intérprete. La lectura conjunta y la revisión individual utilizaban el prompt general de routing, con numerosas reglas de entrega, pago y carrito. La instrucción adicional de revisar una sola imagen no separaba efectivamente esa tarea de decidir el flujo comercial. El modelo podía devolver `datos_envio` o `metodo_pago` con productos vacíos. `conversationService.js` convertía la ausencia de productos de ambas revisiones en los dos avisos de imagen no identificada.

La evidencia previa `../multi-product-followup-2026-10-10/before.json` contiene exactamente esos avisos, con productos vacíos en las tres lecturas. No hubo búsqueda o descarte por peso en esa salida: la identidad faltaba antes de consultar el catálogo. Esta es la limitación de lectura inicial que había quedado documentada en la intervención anterior; los cambios de continuación de `x10kg` se ejecutan después.

## Cambio mínimo

Único archivo de ejecución modificado en esta intervención: `src/services/aiContextOptimizer.js`.

- La lectura conjunta recibe una regla multimodal explícita: extraer los productos visibles y los datos de entrega/pago simultáneamente, aunque no haya una pregunta de precio escrita.
- La revisión individual utiliza un prompt exclusivo de extracción visual con el esquema y reglas de evidencia existentes. No recibe las reglas generales de decidir operaciones del carrito o flujo de entrega. La acción comercial sigue perteneciendo a la lectura principal.
- Una imagen sin producto identificable sigue permitiendo devolver una lista vacía; no se inventan productos para comprobantes, direcciones o imágenes ilegibles.

Se mantienen modelos, número de llamadas, buffer/debounce, equivalencia de pesos, búsqueda, matching y lógica del carrito. No hay aliases ni condiciones por marca.

Archivos de soporte modificados o añadidos:

- `test/individualImageExtractionPrompt.test.js`: contrato del prompt individual y ausencia de cambios en routing solo texto.
- `test/multiImageQuoteContinuity.test.js`: conserva productos y entrega cuando routing devuelve entrega/pago; reproducción de las respuestas reales a través del catálogo y matching.
- `test/fixtures/imageDeliveryVision.json`: respuestas reales con dirección ficticia, incluyendo una lectura conjunta que omite los productos.
- `scripts/audit-image-recognition.js`: escenarios con fotos y únicamente texto de entrega/pago, sin añadir una pregunta de precio. Los escenarios nuevos usan una dirección ficticia.

## Comparación con el modelo real

La prueba inicial con dirección real fue rechazada por revisión automática de aprobación y no se ejecutó. Se aprobó y ejecutó una alternativa con imágenes recortadas verificadas que contienen solo los empaques, estado vacío, cliente nulo, sin historial y texto sintético:

> Para Bloque 1 apto 101. Te puedo pagar con tarjeta cuando lo lleven?

Se llamó al intérprete real con el mismo modelo configurado, usando el constructor de prompt anterior y el actual. Las únicas diferencias entre las dos condiciones son las instrucciones modificadas. No hubo acceso a conversaciones de clientes, envío de WhatsApp ni escritura de pedidos. No se agregó una pregunta de precio para conseguir reconocimiento.

| Lectura | Prompt anterior | Prompt corregido |
| --- | --- | --- |
| Dos imágenes juntas | Productos vacíos | Ambas referencias |
| Max Cat sola | Productos vacíos | Max Cat adulto frango/arroz, sin peso inventado |
| Arena sola | King Cat | King Cat, 25 kg |
| Max Cat repetida | Max Cat | Max Cat adulto frango/arroz, sin peso inventado |

Las salidas completas están en `synthetic-vision.json`. La variación con el prompt anterior reproduce la intermitencia. Cuatro lecturas correctas posteriores no constituyen una garantía estadística de reconocimiento perfecto.

Se reprodujeron las respuestas reales corregidas en el servicio de conversación con catálogo local y persistencia simulada, tanto con lectura conjunta completa como con su omisión deliberada. Ambos escenarios conservaron exactamente dos solicitudes, cotizaron la arena a $62.900 y ofrecieron 1kg, 3kg y 10.1kg para Max Cat, sin mensajes de foto ilegible ni compras implícitas. Estas pruebas cubren la combinación, búsqueda y matching; la comparación externa solo cubre extracción visual. No se probó entrega real por WhatsApp.

## Regresiones finales

- 165/165 pruebas enfocadas: presentación, identidad, imágenes múltiples, contexto, texto/audio, carrito y debounce/scheduler.
- 819/823 con el catálogo local actual. Persisten los mismos cuatro fallos preexistentes: tres casos Diamond/libra y una referencia FELIX en las pruebas del catálogo.
- 823/823 con el catálogo versionado de `HEAD`, sustituido solo en memoria durante las pruebas. No se sobrescribió `productos.json`.
- `git diff --check` sin errores.

Comandos:

```sh
node --test test/individualImageExtractionPrompt.test.js test/shortPresentationFollowup.test.js test/pendingProductAttributes.test.js test/resolvedWeightConversation.test.js test/visualIdentityPresentation.test.js test/multiImageQuoteContinuity.test.js test/visualProductIntent.test.js test/contextualProductRecognition.test.js test/multimodalPipeline.test.js test/conversationScheduler.test.js test/inboundMessageBuffer.test.js
node --test
node --require /tmp/recognition-baseline-catalog.cjs --test
```

El preload de control carga en `require.cache` el catálogo obtenido mediante `git show HEAD:productos.json`; solo aísla las diferencias del catálogo local. La dirección exacta de la captura no se reenvió en las pruebas externas de esta intervención.
