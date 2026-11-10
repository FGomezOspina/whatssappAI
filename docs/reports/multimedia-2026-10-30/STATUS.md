# Multimedia — estado actualizado

Actualizado 2026-10-31T01:04:08.912Z. No es cierre integral: queda pendiente una nueva foto visible por WhatsApp.

## Completado

- 1.152/1.152 pruebas locales, 0 fallos, 8.237,59 ms. Archivo full-suite-final-resume.txt.
- Causas de omisión confirmadas: primer pendiente únicamente en imagen; familia sin cotización fuera del resumen en lista de tres.
- Contexto corregido: recuperar artículo anterior único y reciente, conservar códigos y evidencia visual, tolerar abreviación de especie en referencia, preservar incertidumbre por atributo. Preguntas de formato muestran opciones reales sin sustitución C/D→I/D.
- OpenAI real: imagen original y entradas originales. Revalidación por tramos: api-v2-full fila1 (texto), api-v5-identity-evidence fila1 (imagen), api-v6-followups filas1–2, api-v7-reentry filas1–2. Las extracciones exactas de estado tienen archivos provenance; no son un único replay fresco completo. Las últimas cuatro continuaciones conservan C/D, sin I/D ni handoff.
- Safari sí accesible y Sandbox verificado. Dos nuevas pruebas textuales por UI, provider IDs distintos. Primera 19:55:15 Colombia mezcló pendientes viejos: fallo preservado. Se corrigió vigencia por artículo y separación de consulta múltiple nueva. Segunda 19:58:31 cubre3/3 sin artículos ajenos; su respuesta resumida no repite precios. Ambas delivered y visibles. Detalles en sandbox-results.json; IDs completos en private/sandbox-provider-events.json.
- Carrito vacío y cero pedidos; no envíos a clientes comerciales, no cambios catálogo/precios. No aprendizaje activado.
- Servidor local PID 49998, sesión temporal 26310; health ok y huella d44a04fe6a707fe93dfee114c786679243b4fef52e9889422977be82a5530a15 comprobada. Solo se reinició este proyecto.

## Límites y bloqueos

La foto original se inspeccionó en píxeles y pasó por OpenAI. La especie del pequeño empaque Advance no se considera verificada manualmente; la lectura es incierta. Esto corrige la afirmación demasiado categórica del checkpoint anterior sobre su ilustración.

Subida de foto por Safari: selecciona JPEG válido pero botón Upload deshabilitado, también con copia JPG idéntica; clic por coordenadas falla noWindowsAvailable. Los selectores se cancelaron: ninguna foto nueva enviada, no hay resultado incierto de envío. Falta que el usuario envíe manualmente la foto al Sandbox para observar la secuencia integral. No se sustituyó por texto normalizado ni replay interno.

Tres capturas Library siguen sin inspección en píxeles: helper oficial incompatible con Python3.9 (Path | int). Sin otro runtime instalado en las rutas habituales; no se modificó helper ni se instaló software. El rechazo histórico OpenAI quedó resuelto por autorización posterior y no es bloqueo actual.

Audio: no hay original de estos incidentes; pruebas con transcripción simulada solamente. No afirmar comprensión universal ni equivalencia API/WhatsApp.

## Archivos y evidencia

Producción de esta fase: src/services/conversationService.js, productRequestContext.js, productMatchValidator.js, productEvidenceService.js, aiInterpreter.js; src/utils/text.js (corrección anterior conservada). Test nuevo quotedIdentityReentry.test.js y ampliación multiReferenceCoverage.test.js. Los cambios ajenos permanecen.

api-v1 a api-v7 conservan resultados fallidos y exitosos. v3 fue interrumpida por demora de catálogo, resultado de una llamada en curso no confirmado. Consulta mínima tardó7,9s frente al presupuesto4s; posterior comprobación870/386ms. No se aumentó el timeout. Tokens por ejecución en api-usage-summary.json; costos monetarios no disponibles.

Informe Library: mismoID libfile_d9a9e05b4c448191809eae46aa1a0618, actualizado a versión14 (guard13 satisfecho). La identidad/version están guardadas en library-delivery.json; el helper de xattrs falló con Python3.9 y no se afirma aplicación de atributos locales.
