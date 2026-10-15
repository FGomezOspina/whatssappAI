# Corrección mínima del diagnóstico

Se conservan modelos, prompts, umbrales globales, tolerancia existente del 2%, búsqueda y debounce. No se añaden aliases ni condiciones por marca. `productos.json` no se modifica.

## Archivos de código y pruebas modificados en esta intervención

1. `src/services/productMatchValidator.js`: separa el peso solicitado del peso observado al puntuar identidad visual. Solo la presentación visible con confianza suficiente aporta evidencia visual. Extrae la equivalencia existente de peso a un helper reutilizable para evaluarla antes de penalizar una presentación visual aproximada y después de validar la identidad. La resolución final sigue exigiendo una sola presentación cercana; conserva la preferencia por el peso exacto y la exclusión de rangos de mascota.
2. `src/services/conversationService.js`: descarta lecturas con campos vacíos, conserva productos independientes y compara también `linea` cuando la lectura conjunta y la individual distribuyen el mismo nombre entre campos distintos. Distingue `_imagenErrorTecnico` de `_imagenSinLectura`, conserva la lectura conjunta válida cuando falla la revisión auxiliar y mantiene la salida habitual de persistencia cuando ninguna foto produce una identidad.
3. `src/verticals/petshop/orderLogic.js`: en la ruta que recibe una presentación ya validada, busca igualdad exacta de peso. Evita que `1kg` coincida por subcadena con `10.1kg`. No modifica la búsqueda general de presentaciones.
4. `src/services/productRecognitionTrace.js`: incluye fuente de presentación y error técnico en las trazas optativas. La revisión individual registra hash, índice y resultado (`identificada`, `sin_producto` o `error_tecnico`).
5. `test/visualIdentityPresentation.test.js`: nuevas regresiones de identidad sin peso, texto/contexto, peso aproximado visible, equivalencia ambigua o inexistente, preferencia exacta, variante desconocida, inmutabilidad y cotización/compra con catálogo consolidado. Incluye marcas ficticias para comprobar que la solución es genérica.
6. `test/multiImageQuoteContinuity.test.js`: amplía el simulador y las regresiones para objetos vacíos, lecturas independientes, fallos lanzados y `null`, recuperación de lectura válida y línea comercial distribuida entre campos.

## Hallazgos adicionales durante la validación real

La primera pasada del parche resolvió el matching de 10 kg a 10.1 kg con confianza alta, pero la ruta posterior del pedido seleccionó 1 kg por usar `includes`. Se añadió únicamente la igualdad exacta en la ruta ya validada y pruebas de consulta y compra. La misma pasada mostró una solicitud duplicada cuando `Professional Line` estaba dentro del nombre de una lectura y en el campo `linea` de la otra; comparar también ese campo elimina esa diferencia sin alias.

La evidencia de esta pasada se conserva en [real-intermediate-validation.json](real-intermediate-validation.json). Los resultados finales están en [real-after-minimal-fix.json](real-after-minimal-fix.json).

## Regresiones automatizadas

Resultados guardados en [validation-minimal-fix.json](validation-minimal-fix.json).

| Ejecución | Resultado |
|---|---:|
| Imágenes, identidad, continuidad, contexto, audio, scheduler y buffer | 128/128 |
| Suite completa con `productos.json` actual | 790/794 |
| Mismo código y pruebas con catálogo versionado en HEAD | 794/794 |

Comando focalizado:

```sh
node --test test/visualIdentityPresentation.test.js test/multiImageQuoteContinuity.test.js test/visualProductIntent.test.js test/contextualProductRecognition.test.js test/multimodalPipeline.test.js test/conversationScheduler.test.js test/inboundMessageBuffer.test.js
```

Suite completa: `npm test`.

Los cuatro fallos con el inventario actual ya estaban documentados antes del parche: tres casos Diamond/libra y uno FELIX/húmedo. La prueba de control sustituye solamente el módulo de catálogo en memoria mediante `require.cache` con una copia obtenida de `git show HEAD:productos.json`; no revierte ni escribe el inventario del usuario. Ese control pasó todas las pruebas con el mismo código final.

Para reproducir el control:

```sh
git show HEAD:productos.json > /tmp/recognition-baseline-catalog.json
node --require /tmp/recognition-baseline-catalog.cjs --test
```

El preload utilizado, guardado fuera del repositorio, contiene:

```js
const fs = require('node:fs');
const filename = require.resolve('/Users/gomez/Documents/WhatsappVELTIA/productos.json');
require.cache[filename] = { id: filename, filename, loaded: true,
  exports: JSON.parse(fs.readFileSync('/tmp/recognition-baseline-catalog.json', 'utf8')) };
```

## Alcance de la prueba real

Se repite la matriz del diagnóstico con los mismos recortes y bytes de las capturas, visión real y catálogo de Supabase en solo lectura. El estado es local y se utiliza la respuesta operativa, sin redactor final. No se envían mensajes de WhatsApp ni se guardan pedidos en producción. Esto no sustituye una prueba del transporte real después de reiniciar el servidor.

La matriz final terminó sin errores y las aserciones sobre su informe comprobaron **6/6 casos**:

| Caso | Resultado final |
|---|---|
| Imagen sola, primera vez | Max Cat identificado; ofrece 1, 3 y 10.1 kg. |
| Misma imagen, repetición con estado limpio | Misma identidad y presentaciones. |
| Dos imágenes juntas | Exactamente dos productos; King Cat 25 kg por $62.900 y opciones de Max Cat. |
| Reenviar la primera después de ambas | Max Cat identificado; ofrece sus tres presentaciones. |
| Imagen y texto «Max cat 10kg» | Identidad alta; equivalencia 10 → 10.1 kg; cotiza $178.600. |
| Reenviar después de pedir 10 kg | Conserva identidad alta y cotización de 10.1 kg por $178.600. |

Todos los `productos_combinados` tienen evidencia de identidad. Hay uno en cada caso individual y dos en el caso conjunto, sin entradas vacías ni duplicadas. La verificación también comprueba que los casos con peso no coticen los precios de 1 ni 3 kg.

Artefactos añadidos: este informe, `validation-minimal-fix.json`, `real-intermediate-validation.json` y `real-after-minimal-fix.json`. El ejecutor de diagnóstico anterior no se modificó.
