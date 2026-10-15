# Continuación de presentación después de dos imágenes

## Causa reproducida

El estado sí contenía la identidad de la referencia pendiente y las presentaciones disponibles. `continuarSolicitudProducto` descartaba la continuación si el router devolvía más de un producto, incluso cuando el mensaje actual era únicamente `x10kg` y respondía a la pregunta activa. Esto permitía volver a procesar la lista anterior sin completar su presentación.

Además, al completar la última solicitud de una cotización múltiple, se borraba `ultimaConsultaProducto`. Repetir el peso perdía así el objetivo de la consulta. Las pruebas con intérprete controlado reprodujeron ambas rutas; no se dispone de una traza del servidor para atribuir con certeza cada respuesta histórica de las capturas a una de ellas.

También se reprodujo el incremento indebido de una a dos unidades al aceptar el envío: una propuesta `cantidadDelta: 1` del router se aplicaba sobre la cotización. Aceptar el envío debe comprar las cantidades ya cotizadas.

## Cambios de esta intervención

- `src/services/conversationService.js`: una respuesta formada únicamente por un peso completa la presentación de la consulta activa y vigente, aunque el router repita varias referencias. Se conserva el contexto de la consulta resuelta y las otras líneas cotizadas. La aceptación explícita del envío de una cotización completa, con carrito vacío, utiliza sus cantidades y atributos validados.
- `test/pendingProductAttributes.test.js`: regresión para lista repetida, intención genérica y contexto vencido.
- `test/shortPresentationFollowup.test.js`: secuencias de dos imágenes, repetición del peso, conservación de la otra cotización y aceptación sin duplicar cantidades.
- `scripts/audit-image-recognition.js`: escenarios de continuación de dos fotos y aceptación del envío.

No se añadieron aliases, condiciones por marca, cambios de modelo, umbrales ni modificaciones del catálogo. Otros cambios que aparecen en el árbol de trabajo pertenecen a intervenciones anteriores.

## Resultados

La ejecución controlada con visión y catálogo reales, estado local y sin enviar WhatsApp ni escribir pedidos en producción produjo:

| Turno | Resultado |
| --- | --- |
| Dos fotos y consulta de precio | Arena de 25 kg: $62.900; pregunta por Max Cat mostrando 1, 3 y 10.1 kg |
| `x10kg` | Arena + Max Cat de 10.1 kg por $178.600; total $241.500 |
| Repetir `x10kg` | Misma cotización, sin repetir la pregunta ni duplicar líneas |
| `me los envias por favor` | Carrito con una unidad de cada referencia, total $241.500 |

Evidencia: `after.json` conserva salidas, candidatos, matching y estado por turno; `validation.json` resume las verificaciones. El humanizador se sustituye por una función que conserva la respuesta base. Esta ejecución no constituye una prueba de entrega por WhatsApp.

Pruebas offline del código final:

- 159/159 pruebas enfocadas: continuidad, atributos pendientes, pesos, identidad visual, imágenes múltiples, texto, audio, buffer y scheduler.
- 813/817 con el catálogo local actual. Los cuatro fallos preexistentes son tres expectativas Diamond/libra en `catalogRetrievalRegression.test.js` y una referencia FELIX ausente en `wetFoodCatalog.test.js`.
- 817/817 utilizando exclusivamente durante las pruebas el catálogo de `HEAD`, sin sobrescribir `productos.json`.
- `git diff --check` sin errores.

Comando de la suite enfocada:

```sh
node --test test/shortPresentationFollowup.test.js test/pendingProductAttributes.test.js test/resolvedWeightConversation.test.js test/visualIdentityPresentation.test.js test/multiImageQuoteContinuity.test.js test/visualProductIntent.test.js test/contextualProductRecognition.test.js test/multimodalPipeline.test.js test/conversationScheduler.test.js test/inboundMessageBuffer.test.js
```

Suite completa: `node --test`. Para aislar las diferencias del catálogo se ejecutó `node --require /tmp/recognition-baseline-catalog.cjs --test`; ese preload sustituye únicamente la exportación de `productos.json` en memoria por el JSON obtenido con `git show HEAD:productos.json`.

## Límites de la evidencia real

`before.json` fue un primer intento con las fotos y solamente el texto de dirección/pago. Visión devolvió `datos_envio` sin productos, por lo que no llegó a establecer la pregunta pendiente que muestra el usuario. En `after.json` se agregó una pregunta explícita de precio para establecer ese estado y comprobar la continuación. Los dos archivos no son una comparación antes/después con entradas idénticas y no demuestran que se haya corregido la omisión inicial de productos cuando solo se escribe sobre entrega/pago. Ese comportamiento es independiente y permanece fuera de este ajuste.

La reproducción determinista de la pregunta repetida y de la duplicación de cantidades sí usa las mismas entradas antes y después del cambio. La comprobación con servicios reales se realizó antes del ajuste final de conservación de atributos y orden de solicitudes para medicamentos; la suite final completa cubre también ese ajuste.
