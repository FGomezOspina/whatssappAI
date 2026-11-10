# Incidentes multirreferencia — 30 de octubre de 2026

Estado: correcciones locales implementadas; validación nueva con OpenAI y WhatsApp BLOQUEADA, no terminada.

## Evidencia preservada

- `messages-evidence.json`: entradas originales, respuestas y proyección de interpretaciones persistidas; IDs pseudonimizados. Lectura del Sandbox a las 22:24:29 UTC (17:24:29 Colombia).
- `cases-v1.json`: dos solicitudes originales y sus interpretaciones persistidas. Son estado posterior al procesamiento, no salida cruda del router. El corpus histórico anterior permanece intacto.
- `private/original-two-products.jpeg`: archivo original recibido por Kapso, recuperado mediante el enlace de archivo devuelto por el proveedor; inspeccionado en píxeles. Se ven Hill’s Prescription Diet c/d Multicare y Advance Veterinary Diets Urinary. No es una reconstrucción ni una captura del informe. No se envió a OpenAI.
- Las tres capturas de Library NO fueron descargadas ni vistas. El helper oficial falla en Python 3.9 con `TypeError: unsupported operand type(s) for |: 'type' and 'type'` en la anotación `Path | int`. No se encontró otro Python compatible instalado; descubrimiento de dependencias devuelve que solo está soportado en hilos locales. No se modificó el helper ni se instaló software.
- `catalog-verified.json`: nueva consulta de solo lectura a Supabase. Confirma HILLS FEL C/D 1.8kg, UUID de referencia `3539f23c-f725-4c1d-9d8b-2f83b5cc7bc2`, UUID de presentación `c31016c3-51ff-4720-8781-437d9cae07b1`, código comercial `10301010875`. Confirma también Nutra Nuggets Cordero 1/3kg y las filas Advance Urinary 1.5/3kg. Precio fuera del criterio de identidad.

## Causas comprobadas y límites de la traza

1. Imagen a las 17:06:28 Colombia: la interpretación persistida contiene DOS productos. El armador de solicitudes múltiples usaba `find` para elegir un único pendiente; sin cotizaciones, la respuesta solo incluía esa primera pregunta. Reproducción local exacta de ese comportamiento: Hill’s presente, Advance omitido. No atribuir esta omisión a que visión no vio el segundo producto.
2. Texto a las 16:51:40 Colombia: se conservaron las TRES referencias. Nutra Nuggets Cordero quedó `identificado` con `cotizacion:[]` y presentaciones 1/3kg: el resumen final incluía las cotizaciones de BR Cat y Nexgard, y solo preguntas de registros `pendiente`. Esto silenció la referencia cuyo peso pedido (7k) no estaba cotizado. Reproducción local coincide con la respuesta real.
3. `c/d` en minúsculas no se reconocía como código protegido; `C/D` sí. Además, la normalización de marca concatenaba palabras pero conservaba el espacio interno producido por el apóstrofo de Hill’s. Se perdían restricciones útiles y aparecían candidatos de otras líneas. Corrección general de códigos con barra y marcas declaradas por catálogo.
4. Los términos reducidos del ranking podían eliminar una referencia visual previamente leída al construir una aclaración posterior. Se conserva ahora la identidad respaldada por el nombre observado con confianza suficiente, sin convertirla en coincidencia aprobada.
5. La interpretación persistida de Advance dice `perro`. La imagen original muestra una ilustración felina, pero no se recuperaron las salidas crudas del router/mapa de ese turno; no puede atribuirse con certeza esa etiqueta a un paso concreto. El log actual observado estaba vacío. Los productos no deben heredar especie de otro empaque.

## Cambios generales

- Cada pendiente del lote genera un resultado explícito, manteniendo el foco singular para continuar la primera duda. Las preguntas genéricas de atributos llevan el nombre del artículo al que corresponden.
- Familia identificada con presentación no cotizada sigue pendiente y comunica las presentaciones reales; no desaparece por el éxito de otros artículos. Cantidades y carrito se conservan.
- Códigos con barra sin dependencia de mayúsculas; normalización de puntuación solo contra marcas presentes en el catálogo.
- Conservación contextual de identidad visual ya observada.
- Protección adicional: un código igual no aprueba un modificador comercial no respaldado. El nombre y los metadatos del catálogo permiten confirmar; si no, se conserva el candidato y se pregunta. Pruebas sintéticas Multicare/Multicare Stress: ambas quedan por confirmar si el intérprete las presenta como variantes comerciales adicionales. Esto es una decisión conservadora, no una equivalencia aprendida.
- Instrucción visual general para recorrer todos los empaques y separar identificador/variante del texto descriptivo, con especie/presentación por objeto. No se cambiaron modelos ni se añadieron llamadas adicionales al flujo.

Archivos de producción de esta fase: `conversationService.js`, `productRequestContext.js`, `productMatchValidator.js`, `productEvidenceService.js`, `utils/text.js`. Se preservaron los cambios anteriores; `baseline/` contiene las versiones previas a esta fase.

## Validación

- Dos casos originales de cobertura, misma entrada y extracción persistida: antes 0/2 con cobertura completa; después 2/2. Esto valida procesamiento posterior a extracción, NO percepción nueva ni WhatsApp E2E.
- `test/multiReferenceCoverage.test.js`: casos originales y controles sintéticos separados: códigos distintos, formato seco/húmedo, modificadores no registrados, incertidumbre, listas, mensajes consecutivos, cantidades, transcripción simulada + texto.
- Los tests de audio reciben transcripción simulada; no existe audio original de estos incidentes y no se afirma validación acústica.
- La imagen original fue inspeccionada manualmente, no procesada nuevamente por OpenAI. Su extracción persistida tenía confianza de formato 0.82 para Hill’s, inferior al umbral existente 0.85: se mantiene aclaración de formato. El primer test exploratorio que exigía identificación exacta pese a esa incertidumbre se corrigió para exigir candidatos del mismo código y aclaración; no se cuenta como mejora de exactitud. La prueba de código estructurado y formato explícito es sintética.
- El resultado de la suite completa final queda en `full-suite-final.txt`; no equivale a validación universal.

## Bloqueo de ejecución y siguiente paso

La revisión automática rechazó antes de ejecutarse el comando `replay-multireference-incident.js --authorized-openai-test --reviewed-product-image --run=api-v1`, alegando que solo estaban autorizadas pruebas locales y que la divulgación externa exacta no estaba aprobada. La historia del padre contiene autorización posterior para OpenAI y fotos de producto sin PII; no se intentó otra ruta ni se hizo un nuevo envío. Estado: DENEGADO, conocido NO EJECUTADO. Cero tokens nuevos, cero mensajes, cero pedidos y cero reinicios en esta fase.

El harness está desactivado por defecto, exige flags explícitos y un nombre de ejecución nuevo; utiliza el cliente/modelos existentes, Supabase de solo lectura y persistencia en memoria. Falta revalidar la extracción real, la secuencia de aclaraciones completa y la respuesta visible en Sandbox después de resolver la revisión de autorización. No reiniciar/usar Sandbox como vía indirecta para saltar el rechazo.

También falta materializar las tres capturas cuando haya un runtime compatible o archivos locales proporcionados por el usuario. Esto no invalida la evidencia independiente de la foto original y los mensajes persistidos.

Suite final: 1140/1140 pruebas verdes; 0 fallos; duración local 8130.358208 ms. `git diff --check` sin errores. No es latencia WhatsApp.
