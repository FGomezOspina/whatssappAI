# Continuación por peso después de una imagen

## Reproducción

Secuencia de las capturas: imagen sin peso → pregunta por presentación → `x10kg` → `x10kg` → `x10.1kg`.

Se reprodujeron errores deterministas distintos de enviar imagen y peso en el mismo turno:

- En `continuarSolicitudProducto`, los pesos producían una lista vacía de tokens de identidad. `every()` sobre esa lista devolvía verdadero y seleccionaba la primera presentación ofrecida, 1 kg.
- El segundo extractor usaba un límite de palabra antes del número. En `x10kg` no encontraba el número completo; en `x10.1kg` podía encontrar solamente `1kg` después del punto. Esa lectura parcial se guardaba como nueva evidencia textual.
- El selector de productos del historial interceptaba las consultas continuadas y devolvía la ficha con todos los pesos antes de resolver la equivalencia 10 → 10.1 kg. El simulador reprodujo el mismo texto «Perfecto, encontré… Presentaciones y precios…» de la captura.
- La ruta general `buscarPresentacion` seguía aceptando `1kg` por subcadena dentro de `10.1kg`; la corrección anterior solo protegía la ruta que recibía una presentación ya validada.

## Cambios

- `src/services/conversationService.js`: reutiliza `extraerPesoTexto`, conserva la medida completa, evita seleccionar opciones mediante tokens vacíos y envía las continuaciones con referencia y peso al matching existente, tanto para consultar como para comprar.
- `src/verticals/petshop/orderLogic.js`: si el mensaje contiene un peso explícito, lo compara completo y normalizado; no busca una subcadena dentro del decimal.
- `test/pendingProductAttributes.test.js`: añade 12 casos de aclaración con y sin evidencia visual previa, prefijo `x`, `por`, punto y coma decimal.
- `test/shortPresentationFollowup.test.js`: añade tres casos de selección pendiente sin interpretación y cuatro secuencias completas con Max Cat y una marca ficticia, consulta y compra.
- `scripts/audit-image-recognition.js`: añade `AUDIT_CASE_FILTER=seguimiento`, con imagen inicial y tres turnos posteriores exclusivamente de texto; el informe también conserva carrito y productos consultados.

Se conserva la equivalencia existente: identidad previamente validada, peso exacto preferido y una sola alternativa cercana dentro del 2%. No se añaden aliases ni reglas por marca. No se modifican catálogo, modelos ni debounce.

## Validación automatizada

```sh
node --test test/shortPresentationFollowup.test.js test/pendingProductAttributes.test.js
```

Los 25 casos de estos dos archivos pasan. Las 19 regresiones nuevas comprueban conservación de la medida, una sola presentación, precio de $178.600 y cantidad 1. La consulta no agrega al carrito; la compra agrega únicamente 10.1 kg.

La suite focalizada ampliada incluye además imágenes, audio, carrito, matching, contexto y debounce. Los totales están en `validation.json`.

## Prueba real

```sh
AUDIT_CASE_FILTER=seguimiento node scripts/audit-image-recognition.js /tmp/recognition-first.png /tmp/recognition-second.png docs/diagnostics/presentation-followup-2026-10-10/real-followup.json
```

Visión y búsqueda de Supabase reales, estado/historial local y respuesta operativa sin redactor final. La foto es el mismo recorte del empaque utilizado en el diagnóstico anterior. No se envían mensajes ni se guardan pedidos en producción. La prueba verifica turnos de texto separados de la imagen, sin reutilizar sus bytes en esos turnos.

El informe `real-followup.json` conserva `vision output → producto interpretado → búsqueda → candidatos → match final`, respuestas y selección en estado.

Resultado real: **4/4 turnos verificados**. La imagen ofrece 1, 3 y 10.1 kg; cada respuesta posterior (`x10kg`, repetición y `x10.1kg`) cotiza únicamente **10.1 kg por $178.600**. Se verificó el peso/precio almacenado en `productosConsultados` y que los turnos posteriores no incluyeran imágenes ni agregaran productos al carrito durante la consulta.

Regresiones: **153/153 focalizadas**; **809/813 con el catálogo actual**, con los mismos cuatro fallos previos; **813/813 con el catálogo versionado** cargado solo en memoria como control. `productos.json` permanece intacto por esta intervención.
