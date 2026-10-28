# Reconocimiento comercial e intención contextual — 28 de octubre de 2026

Las mejoras están integradas localmente en el proyecto `WhatsappVELTIA` y contrastadas con el catálogo vigente de Supabase. En 30 solicitudes de las pruebas del usuario en Kapso, la búsqueda remota más el validador pasa de **21/23 a 22/23 identidades identificables correctas** (91,3% → 95,7%). La identificación incorrecta observada pasa de **1 a 0**. No se modificó Supabase, no se enviaron mensajes de WhatsApp ni se generaron pedidos reales.

Esta muestra es de pruebas, no tráfico comercial. El resultado no constituye una tasa general de acierto del agente: los 26 casos reservados de evaluación mantienen el mismo resultado; las mejoras medidas se concentran en los cuatro casos de desarrollo. El único falso negativo restante del recorrido determinista se resuelve en el ensayo completo con el modelo. No se afirma mejora de latencia de respuesta del modelo porque no se pagó una línea base comparable.

## Evidencia y cobertura

- Kapso: 24 conversaciones, **1.885 mensajes**, 34 páginas de mensajes; listado de conversaciones completo en una página. Registros entre 30/05 y 14/10/2026. Se revisaron patrones textuales y respuestas problemáticas en los chats; 30 fragmentos distintos tienen etiqueta contrastada con catálogo. La [matriz por chat](cobertura-chats.md) documenta cobertura y límites. No se repitió OCR/transcripción de los archivos multimedia; se conservaron sus regresiones existentes.
- Supabase: lectura completa del cliente pertinente el 28/10 a las 14:53 UTC: 394 marcas (392 activas), 1.127 referencias (1.116 activas), 1.423 presentaciones (1.388 activas). Paginación de marcas: 1; referencias: 10 lotes/páginas; presentaciones: 29 lotes/páginas. Filtros por cliente y relaciones de catálogo. [Cobertura exacta](supabase-coverage.json).
- Historial actual en Supabase: 5 mensajes, 1 conversación; 56 ejemplos pendientes y ninguno aprobado. El usuario confirmó que borra sus pruebas y que todavía no tiene historial comercial. Los registros de Kapso son la fuente prevista; no se buscaron otros clientes/empresas.
- El fallo DNS inicial quedó resuelto después de la reconexión. `diagnostico-previo.txt` conserva ese punto de partida histórico; no representa el estado actual.
- Las etiquetas se basan en IDs, especie y presentaciones del catálogo vigente. No en lo que respondió el bot ni en la mera aceptación del cliente. No hay snapshots históricos por fecha: no se puede atribuir cada error antiguo al código o al inventario actuales.
- No hay teléfonos, direcciones ni nombres de clientes en los fixtures/reportes entregados. La procedencia se conserva como Cxx/Mxx y hash, sin publicar las conversaciones completas.

## Causas comprobadas antes de corregir

1. **Recuperación y validación son etapas distintas.** El flujo real recibe `catalogo=[]`, consulta RPC FTS/trigram y reduce candidatos. El ranking local favorecía términos frecuentes como gato/adulto frente a línea o marca distintiva. Cat Show Delimix y Fofi cat tofu se perdían en el top 8 local, aunque el validador los identificaba con catálogo completo. La RPC vigente ya recuperaba ambos: esa mejora local no se atribuye falsamente a producción.
2. **Abreviaturas de etapa.** `a raza pequeña` no preservaba adulto y permitía seleccionar `DOG CHOW C RP`, cachorro. La presentación de adulto solicitada tampoco está respaldada de forma suficiente; corresponde aclarar, no ofrecer cachorro.
3. **Código comercial sin puntuación.** `hills lata ad` se confundía con abreviaturas genéricas y no recuperaba una identidad validada. `A/D` está declarado en el catálogo; no es una equivalencia inventada con otra dieta.
4. **Familias y presentaciones ambiguas.** Pro Plan para gatos EN puede significar FELINE EN o FELINE LATA EN. Color de bolsa, marca sola o reempacado no demuestran una variante. SIETE VIDAS aparece como perro/1,5 kg y no respalda sobres para gatos. Vivance/Vitality no autoriza sustituir por Ringo Vitality. Esto es incertidumbre o conflicto de datos, no necesariamente ausencia del producto en el negocio.
5. **La segunda interpretación podía modificar la intención comercial.** Un ensayo real produjo consulta en el router y agregar en el mapeo de catálogo. El reconciliador conservaba la acción superior, pero mezclaba una operación de carrito incompatible. Se corrigió con una regresión determinista.
6. **Aprendizaje sin contrato de identidad.** Los ejemplos narrativos existentes no vinculan una equivalencia revisada con referencia, mensaje fuente y versión del catálogo. Una respuesta pasada del bot no prueba identidad.
7. **Escalamiento sin estado operativo.** No existía una transición que suspendiera al bot para atención humana. Las advertencias clínicas eran instrucciones de texto. Las aclaraciones fallidas podían repetirse sin un cierre.

## Cambios realizados

Se mantiene el recorrido Kapso → buffer/serialización → persistencia → router semántico → recuperación → validación → motor → respuesta. No se añadieron embeddings ni otra llamada LLM al recorrido normal.

- `catalogIdentityRanking`: puntuación informativa derivada de la frecuencia de palabras en los nombres comerciales, nombres originales y alias declarados del catálogo de ese cliente. Une palabras separadas solo cuando existe la forma unida. Es ranking de candidatos, nunca confirmación de identidad.
- `text` y `catalogDeclaredCodes`: abreviaturas generales de etapa y puntuación de códigos realmente declarados, condicionada por marca explícita y formato comercial. No se añadieron listas de marcas/productos en el código de producción. Si hay significado competidor, no se transforma.
- `productMatchValidator`: sigue validando marca, referencia, especie, etapa y presentación. El texto de no coincidencia pide una aclaración útil y no sustituye por otra referencia.
- `productEvidenceService`: el mapeo refina identidad; conserva acción, operación de carrito y cantidades de la decisión contextual previa. Evita preguntas de modificación de carrito durante una cotización.
- `aiContextOptimizer`/`aiInterpreter`: campos estructurados para criterio veterinario, petición explícita de asesor y seguimiento de aclaración. Distingue consulta comercial de medicamento conocido de solicitud clínica. Saludos mixtos conservan el producto; conversación general no fuerza catálogo. Los campos adicionales se limitan al router para conservar el presupuesto compacto de otras llamadas.
- `humanHandoffService`, `conversationService`, estado y repositorio existentes: marca `atencionHumana.estado=pendiente` y `status=pendiente_asesor`; guarda antes de responder y devuelve `null` en turnos posteriores, antes de multimedia/modelo/búsqueda. La primera aclaración utiliza catálogo/contexto; una aclaración fallida escala. Una nueva solicitud reinicia el intento y el progreso entre atributos permite seguir aclarando. Un fallo técnico de catálogo no cuenta como ausencia.

**No se construyó panel ni integración de operadores.** La marca persistida no notifica ni asigna un asesor; la respuesta indica que queda pendiente, no que alguien fue contactado. El futuro panel deberá mostrar ese estado y realizar una reanudación explícita (`atencionHumana.estado=cerrada`, `aclaracionIdentidad=null`) conservando el resto del estado. Un mensaje del cliente no levanta la pausa. No se ejecutó ninguna transición administrativa en producción. El alcance de concurrencia probado es el coordinador por conversación de este proceso; no se añadió coordinación distribuida entre múltiples servidores.

## Aprendizaje progresivo preparado, desactivado

La migración `supabase/010_verified_product_identity.sql`, el repositorio de lectura y `scripts/review-product-identities.js` forman un mecanismo supervisado:

1. Se propone una mención literal de un mensaje entrante persistido, con empresa, referencia y procedencia. Nace pendiente.
2. Una persona contrasta identidad/variante con catálogo y aporta autor y justificación de revisión. No se aprueba por respuesta del bot, por un “sí” ni por puntuación del modelo.
3. Solo aprobaciones vigentes, sin conflicto, del mismo cliente y con fuente/identidad intactas pueden aportar candidatos. La marca, especie y presentación vuelven a pasar por el validador normal.
4. Se conserva auditoría, caducidad de 90 días y revocación. Cambios de identidad, estado activo o fuente invalidan la evidencia. Cambios de precio no congelan precios: se leen los actuales.
5. No hay caché de aprobaciones ni entrenamiento automático sobre el conjunto de evaluación. La coincidencia del alias es normalizada y exacta sobre la mención usada para buscar; no se generaliza automáticamente a frases o variantes no revisadas.

`PRODUCT_IDENTITY_EVIDENCE_ENABLED` permanece desactivado. En ese estado no añade consultas. Activado aporta una lectura opcional paralela con señal de timeout de 1,2 s; el cliente HTTP existente conserva su política de reintentos. Esa latencia activada no fue medida contra producción.

La migración **no se aplicó** a Supabase. Pasó en PostgreSQL WASM efímero (PGlite), con tablas reales del proyecto y fixtures sintéticos revertidos. Prueba fuente entrante, ámbito, aprobación, conflicto, precio actual, referencia desactivada/modificada, fuente modificada, revocación y auditoría. Falta validación de permisos/despliegue en un staging Supabase real antes de activarla. El CLI es dry-run por defecto; `--apply` escribe y requiere autorización para producción. Borrar el mensaje fuente elimina la evidencia vinculada: mientras se elimine todo el historial, no hay memoria supervisada duradera. No se importaron los mensajes de Kapso a Supabase.

## Antes y después

Etiquetas: 23 solicitudes permiten identificar una referencia/familia; 7 requieren confirmación o revisión de catálogo. Se aceptan las dos referencias activas de Chunky adultos mayores cuando no se pide presentación; no se contabiliza una como error por diferencias de nombre. El caso EN queda ambiguo, no forzado a alimento seco.

| Medida | Antes | Después |
|---|---:|---:|
| Identidades correctas, RPC Supabase + validador | 21/23 (91,3%) | 22/23 (95,7%) |
| Identificables no resueltas | 2/23 | 1/23 |
| Identificaciones incorrectas en los 30 casos | 1 | 0 |
| Ambiguas/no verificables correctamente no confirmadas | 6/7 | 7/7 |
| Precisión entre identificaciones confirmadas | 21/22 (95,5%) | 22/22 (100%) |
| Búsqueda + validación remota, mediana | 683 ms | 671 ms |
| Búsqueda + validación remota, p95 | 1.046 ms | 1.068 ms |
| Consultas HTTP acumuladas, 30 casos | 131 | 131 |
| Errores técnicos observados | 0 | 0 |

Una ejecución por caso/versión alternando orden; no es una prueba estadística de latencia. [Datos remotos](live-benchmark.json).

La repetición offline del snapshot Supabase, cinco mediciones tras calentamiento, pasa de 19/23 a 22/23 y elimina tres omisiones del top 8; mediana total 45,3 → 47,5 ms, p95 81,0 → 89,9 ms. [Antes](supabase-snapshot-baseline.json) y [después](supabase-snapshot-after.json). Es un recorrido local distinto del remoto y no debe sumarse como más clientes.

En los **26 casos reservados**: 20 identificables, 19 correctos, 1 omitido, 0 erróneos y 6 ambiguos en ambas versiones. Se separaron de los cuatro usados para ajustes; todos pertenecen al mismo entorno de pruebas y ya fueron inspeccionados, por lo que no son un ensayo ciego ni una estimación independiente de generalización. No se emplearon equivalencias aprendidas en ninguno de esos benchmarks.

## Seis ensayos autorizados con OpenAI

Se usó el flujo completo de texto con catálogo real, estado en memoria, historial vacío y persistencia/envíos sustituidos por dobles locales. Se ejecutaron exactamente seis ensayos (18 llamadas del flujo existente), con router `gpt-5.4`, mapeo `gpt-5.2` y humanización `gpt-5.4-mini`. No se hicieron ensayos adicionales después de la corrección de intención.

| Consulta | Resultado observado |
|---|---|
| Cat Show Delimix 10 kg | Identidad/precio correctos ($164.900); cierre erróneo sobre modificar carrito, corregido y probado determinísticamente |
| Fofi cat tofu | ARENA FOFICAT TOFU, 2,5 kg, $25.900 |
| Dog Chow a raza pequeña 2kl | No inventa adulto 2 kg ni sustituye cachorro; pide continuar aclaración |
| Hills lata ad | HILLS CAN Y FEL LATA A/D, 5,5 oz, $22.000 |
| Me gustaría agregar arena maíz 20kl | ARENA MAIZ CAT 20 kg, $98.000; carrito solo en memoria del ensayo |
| Proplan para gatos EN | Pregunta si FELINE EN o FELINE LATA EN |

Tiempo total mediano **13,21 s**, rango **11,02–16,41 s**, sin incluir entrega WhatsApp. [Registro de los seis ensayos](model-six-trials.json). Cuatro identidades correctas y dos respuestas de aclaración; una de las cuatro respuestas tuvo el problema conversacional indicado. No son seis respuestas perfectas ni una comparación antes/después del modelo. Las intenciones clínicas y handoff se comprobaron con interpretaciones simuladas, no con más ensayos pagados.

## Regresiones y entrega

Línea base: **896 pruebas; 892 pasan y 4 fallan**. Final: **921/921 pasan**, 25 pruebas nuevas. Los cuatro fallos previos eran fixtures que usaban contenedores crudos/duplicados: tres de libra y uno de FELIX. Se usan la carga normal del catálogo y la búsqueda en todas las familias correspondientes; no se cambió la regla comercial de libra ni sus resultados esperados.

Se comprobaron imágenes múltiples, audio/procesamiento existente, continuidad de cotización/compra, presentaciones, carrito, idempotencia, buffers, mensajes concurrentes, pausa tras reinicio, aislamiento entre empresas y fallo de persistencia. Una respuesta obsoleta se descarta y el siguiente lote respeta la pausa. No se crearon tests de una lista hardcodeada de equivalencias; también se usaron marcas sintéticas para comprobar comportamiento general.

Reproducción offline desde la raíz del proyecto:

```sh
npm test
node scripts/benchmark-product-recognition.js . docs/reports/recognition-2026-10-28/catalog-snapshot.json
```

La fuente inicial quedó preservada localmente en `/Users/gomez/Documents/Codex/2026-10-28/task/baseline-source`, sin credenciales, incluyendo los cambios previos del usuario. El script de benchmark acepta esa ruta para repetir la línea base. Los artefactos preliminares basados únicamente en `productos.json` no se incluyen como resultados finales.

Pendientes operativos: aprobar y validar la migración en staging antes de activar memoria de identidades; conservar fuentes revisables para aprender; conectar en el futuro el estado de atención humana con el panel del usuario. No se hizo push, despliegue ni escritura productiva. El hallazgo restante sobre frase cortés se resuelve con el router/mapeo actual en el ensayo completo, pero permanece como omisión en la prueba de búsqueda/validación sin modelo.

Verificación tras integración en el repositorio original: 921/921 pruebas pasan; `git diff --check` sin errores. Se copiaron 36 archivos revisados tras comprobar ausencia de modificaciones concurrentes y respaldar los archivos anteriores. No se reinició el servicio.
