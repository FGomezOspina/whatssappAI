# Recuperación de identidad comercial

## Reproducción y causa raíz

Se reprodujo antes de modificar producción usando `productos.json` y la identidad visual proporcionada: `MIRRINGO ARENA PARA GATOS`, marca interpretada `MIRRINGO`, especie `gato`, categoría `arena_sustrato`, sin peso.

1. `seleccionarCatalogoRefinadoVision` incluía `ARENA MIRRINGO` en sus candidatos.
2. El catálogo contiene una agrupación `MIRRINGO` de alimento y otra `ARENA`, que contiene `ARENA MIRRINGO`.
3. `validarCoincidenciaProducto` convertía la marca interpretada en un filtro de agrupación. `marcaCompatibleConIdentidad` solo admitía cierta relación entre nombres de las agrupaciones; no consideraba suficiente que la marca observada formara parte del nombre comercial de una referencia de otro grupo.
4. Se descartaba la arena antes de puntuarla; el alimento se descartaba por categoría. Resultado reproducido: `nivel=baja`, `score=0`, `sin_coincidencia_confiable`, sin alternativas.

No era un problema de visión ni de ausencia del candidato en la primera búsqueda. Tampoco requería ampliar el contexto del modelo. La reproducción usa la salida visual suministrada; no se volvió a analizar la fotografía original.

## Corrección acotada

Se conserva el pipeline y los umbrales existentes. El catálogo sigue siendo la fuente de nombres, presentaciones y precios.

- `src/services/productMatchValidator.js`: permite atravesar una agrupación distinta cuando la identidad comercial está respaldada por los nombres, descripción o metadata comercial de la referencia y sus presentaciones. El mismo criterio alimenta el filtro y la señal de marca visual. Los atributos auxiliares se separan de la identidad. La especie declarada en el campo `especie` también puede descartar contradicciones, aunque el nombre no la repita. Una marca desconocida observada con confianza alta o explícita en texto no se confirma solamente por compartir atributos.
- `src/utils/catalogSearchDocument.js`: extrae texto comercial de nombre, descripción, especie, categoría, subcategoría, etapa, nombres originales, alias declarados, keywords, pesos y metadata comercial de las presentaciones. Excluye campos operativos como source, ids y llaves de la evidencia de nombres.
- `src/services/catalogContextService.js`: usa ese documento para puntuar candidatos locales y reordenar candidatos RPC.
- `supabase/009_catalog_presentation_identity.sql`: añade al documento FTS los nombres y descriptores de la metadata de presentaciones activas. El RPC anterior los devolvía, pero no los incluía en la búsqueda. Mantiene contrato, permisos y aislamiento por cliente.
- `test/commercialIdentityRetrieval.test.js`: reproducción, pruebas generadas y replay de conversación con persistencia simulada.
- `supabase/verify_009_catalog_presentation_identity.sql`: prueba transaccional de recuperación exclusiva por metadata de presentación, precio, aislamiento entre clientes y exclusión de presentaciones inactivas; termina en rollback.
- `docs/aivance-multiempresa.md`: orden de aplicación y verificación de la migración.

## Evidencia y prevención de falsos positivos

El orden de tokens no condiciona el cruce entre agrupaciones. Se reutilizan la normalización de acentos, mayúsculas, puntuación, unidades y atributos semánticos existentes. Se admiten singular/plural simple y una edición en tokens de al menos cinco caracteres como tolerancia secundaria; no se reescriben ni fusionan referencias almacenadas.

Para abrir el filtro entre agrupaciones se exige que los tokens comerciales de la marca propuesta y de la consulta estén respaldados por un mismo nombre o descriptor registrado. Categoría y especie no bastan. Los términos auxiliares de categoría se obtienen de los campos reales del candidato, evitando eliminar características distintivas solo porque un sinónimo pertenezca a la misma categoría.

Después se conservan ranking, evidencia de especie/categoría/variante/presentación y separación entre candidatos del validador existente. El umbral alto por defecto sigue en 0,84 y el margen base en 0,08, con las reglas de convergencia ya existentes. No se disminuyeron estos umbrales. Las referencias similares siguen compitiendo y producen aclaración cuando falta evidencia suficiente. Los códigos y variantes comerciales existentes siguen protegidos.

No se agregó ningún nombre de producto, marca, categoría o alias específico a producción. Los nombres del caso real y los sintéticos están únicamente en pruebas y documentación.

## Resultado y comprobaciones

`MIRRINGO ARENA PARA GATOS` recupera `ARENA MIRRINGO` con confianza alta. Sin peso, identifica el padre y solicita presentación, conserva las opciones de 5 kg ($26.900) y 10 kg ($48.500) y no agrega productos. En el replay, la continuación `5kl` cotiza únicamente $26.900 y mantiene el carrito vacío porque se trata de una consulta.

Se generaron tres familias ficticias deterministas. Se cubren orden invertido, especie fuera del nombre, descripción adicional, puntuación y mayúsculas, typo leve, plural, nombre parcial suficiente, original_names con pesos, nombres disponibles solo en metadata de presentación, múltiples presentaciones, dos referencias plausibles, contradicciones de especie/categoría e identidad desconocida. También se prueban identidades disponibles exclusivamente en descripción/original_names y texto equivalente a una transcripción.

Validación final: `npm test`: **735 pruebas aprobadas**, **677 anteriores + 58 nuevas**, cero fallos. `git diff --check`: sin errores.

Las pruebas JavaScript usan catálogo local y salidas del intérprete simuladas; no requieren ni comprueban llamadas en vivo a OpenAI o Supabase. La migración 009 y su verificador SQL están preparados, pero no ejecutados en una base PostgreSQL en esta sesión. No se desplegó el backend ni se enviaron mensajes de WhatsApp.
