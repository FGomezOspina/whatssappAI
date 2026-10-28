# Auditoría final de clasificación — R4

**R4 FINAL DEL LOTE SEGURO. Supabase: cero escrituras. Quedan 220 referencias con incertidumbre documentada.**

Se revisaron **1121 referencias, 1397 presentaciones y 392 grupos**. Se aplicaron localmente **346 correcciones de referencia / 555 campos**. El SQL final propone **374 referencias / 606 campos** de Supabase. No se ha escrito en la base de datos.

## Consolidación y cobertura

Las 256 pendientes de R3 tienen desenlace: **35 corregidas con evidencia, una ya correcta y 220 requieren dato o decisión**. SINSONTES Y TUR (341:0) mantiene su clasificación de alimento para aves. Hubo 37 referencias modificadas durante esta consolidación: 35 quedaron resueltas y dos (Mungos MultiVit/Mobility) recibieron una corrección segura de categoría, conservando pendiente la especie. No queda ninguna marcada como «por consolidar».

Las 220 restantes no son 220 errores confirmados: incluyen desconocimiento de destinatario, variantes sin identificar y decisiones que exigen separar entidades o ampliar taxonomía. En 18 hay correcciones acumuladas en campos comprobados, conservando el campo dudoso. Todas tienen razón y dato requerido por referencia en [REVISION-MANUAL.md](REVISION-MANUAL.md), código y UUID cuando existe. [consolidacion-256.json](consolidacion-256.json) contiene el desenlace anterior/nuevo y las consultas archivadas.

| Dato o decisión principal | Referencias |
| --- | --- |
| Etiqueta del stock y destino autorizado | 99 |
| Identidad, fórmula o presentación exacta | 91 |
| Divergencia local/remota sin identidad suficiente | 13 |
| Declaración de alimento completo o complementario | 7 |
| Variantes incompatibles agrupadas en una referencia | 4 |
| Conejos y límite de taxonomía actual | 3 |
| Identificador remoto ausente como problema principal | 3 |


## Criterios y hallazgos corregidos

- Categoría representa la naturaleza comercial del producto; especie identifica destinatario. Se reutilizan las categorías y subcategorías admitidas sin crear enums ni modificar esquema.
- Pañoletas (283:0 y 283:1): `perro/comida/concentrado` pasa a `otro/accesorio/accesorio`. No hay evidencia suficiente de exclusividad canina ni de aptitud universal: la especie y talla siguen requiriendo etiqueta. No se declaró perro/gato por ambigüedad.
- Se corrigieron especies felinas en referencias identificadas de Gatsy, Félix, Oh Mai Gat, Hill's FEL, Royal y Virbac. Alimento dietético sigue siendo comida; golosinas y carnazas se distinguen de alimento completo.
- Se separaron utensilios, juguetes, higiene, suplementos y medicamentos. Ration, Klerat y Sinrat ambientales no son alimentos. Sanuch 15 g se clasifica como antiparasitario. Shampoo insecticida y collar antipulgas no se tratan como higiene ordinaria.
- Evidencia de fabricante por variante: Bolfo polvo 100 g/shampoo 100 mL, Cardio B+E, Clorhexin, Sedan PET, Sutrim, Miclor/Peroxy Proc, Canatox y Novacan T. No se extendieron estas conclusiones a otras concentraciones o formatos pendientes.
- C-Thyro Tabs 0,2–0,8 mg: destino canino respaldado por etiqueta Lloyd/DailyMed. Revolution 6 % para menos de 2,5 kg tiene perro/gato explícito; la referencia de 0,25 mL sin concentración no hereda ese destino.
- Baytril agrupa 150 mg canino y 50 mg canino/felino. No se añade gato a toda la referencia. La representación por presentación exige un cambio fuera del alcance. Igual criterio para los otros tres casos con variantes incompatibles.

Cambios locales por campo: {"especie": 206, "subcategoria": 167, "etapa": 28, "metadata.especies": 26, "categoria": 128}. Las 28 correcciones de etapa son clasificación, basadas en indicaciones explícitas y retirada de la falsa etapa en arena KITTEN. Se usan valores multiespecie ya interpretados por el agente y 26 listas `metadata.especies` documentadas. Se preservan las demás claves de metadata.

## Datos protegidos y correspondencia remota

Nombres, marcas, precios, pesos, identificadores, textos, confirmación, presentaciones y demás atributos permanecen iguales al respaldo. La auditoría verifica invariancia estructural. No se modificó la lógica ni arquitectura del agente para esta revisión; los cambios previos de reconocimiento/handoff se preservaron.

Hay 1116 enlaces únicos: 1115 por códigos comerciales y uno por igualdad exacta compuesta (AGILITY GRAND CACH, sin cambios). No se emparejó por nombre aproximado. Se excluyen once referencias remotas inactivas sin contraparte. Se conservan 37 diferencias previas de nombre/marca. Los UUID y tenant se vuelven a validar en SQL.

Las listas de cambios tienen **345 referencias comunes, 1 solo locales y 29 solo remotas**. Se comparan contra estados previos distintos; algunas correcciones ya estaban presentes en uno de los catálogos. Los conteos anteriores 184/202, 220/240 y 309/337 eran revisiones parciales y quedan sustituidos por R4.

Cinco referencias no tienen enlace remoto seguro y se excluyen del SQL (dos tienen otra causa principal en la tabla anterior):

| Índice | Producto | Códigos |
| --- | --- | --- |
| 113:0 | CREDELIO | ["10601011332", "10601011343"] |
| 115:0 | CUCHUCO | ["10301030520"] |
| 199:0 | IXER | ["102010102040"] |
| 202:0 | JERINGA | ["10601010930", "10601010931", "10601010932"] |
| 287:0 | PET MILK | ["10301011334", "10301011335"] |


Dato protegido señalado para otra tarea: código 104010102017, CHUNKY DELICAT PAG 3 LLEV 4, contiene peso `3 l`. No se convirtió una promoción en peso ni se corrigió fuera del alcance.

## Datos concretos necesarios para cerrar las incertidumbres

1. Etiqueta y código/EAN del stock de las 99 referencias con destino no documentado: fabricante, registro, concentración, formato y especies. Especial atención a Royal Beauty 150 g, Revolution 0,25 sin concentración y Felinnex.
2. Identidad exacta de las 91 referencias genéricas, promociones o variantes: línea y presentación, sin cambiar nombres o pesos por inferencia. Panzer Sobre requiere identificar el producto del stock antes de decidir si su clasificación de alimento corresponde; la coincidencia con otro producto no prueba identidad.
3. Para las 13 divergencias, confirmar qué ficha/código representa el stock. No se elige arbitrariamente entre el JSON y Supabase.
4. Para siete alimentos dudosos, declaración de alimento completo o complementario. Una marca o ingrediente no basta.
5. Decisión de alcance para cuatro referencias que agrupan destinos distintos por presentación y tres de conejo. No se separaron entidades ni se introdujo una especie nueva.
6. UUID del tenant o confirmación de que no fueron importadas las cinco referencias sin enlace. No se crearon registros ni se emparejaron aproximaciones.

## Validación

- **921/921 pruebas completas**, cero fallos, omitidas o canceladas: [tests.r4.txt](tests.r4.txt).
- **546 verificaciones de filtros** de especie/categoría por catálogo local, REST y RPC; **tres cotizaciones**, precios intactos y carrito vacío: [behavior-validation.json](behavior-validation.json).
- **13 escenarios SQL** en PostgreSQL/PGlite: aplicación exacta de 374 referencias, reversión real, invariancia de otros campos/tenant/presentaciones, rechazo de segunda aplicación y cambios concurrentes: [sql-validation.r4.txt](sql-validation.r4.txt).
- Lectura remota de solo lectura: **2026-10-28T18:27:08.504Z**, 1127 referencias, sin cambios frente al respaldo: [remote-recheck.json](remote-recheck.json). Las guardas vuelven a verificar vigencia al ejecutar.

Límite preexistente comprobado: la consulta directa por nombre puede cotizar una pañoleta para gato sin especie documentada; ocurre también con el respaldo original. Los filtros estrictos sí respetan los destinos declarados. La corrección de datos no promete bloquear todas las rutas de cotización por compatibilidad; cambiar ese comportamiento sería otra tarea.

## Entrega y ejecución

La única versión aplicable es [apply-supabase.sql](apply-supabase.sql), **clasificacion-20261028-r4**. [EJECUCION-SUPABASE.md](EJECUCION-SUPABASE.md) explica aplicación y reversión. Usa una transacción con bloqueos, estado previo completo, ID/tenant, conteos y verificación posterior. El resultado final incluye lectura posterior y el script `rollback_sql` con timestamps reales; guardar esa celda completa. No se utilizó PATCH REST ni se alteró RLS o permisos.

[CAMBIOS.md](CAMBIOS.md), [coverage.json](coverage.json), [local-changes.json](local-changes.json) y [remote-plan.json](remote-plan.json) registran evidencia, confianza y valores antes/después. [DATOS-OPCIONALES.md](DATOS-OPCIONALES.md) separa notas y campos no aplicables. [FINAL.json](FINAL.json) identifica versión y hashes. Respaldos originales: `productos.before.json` y `supabase.before.json`, permisos 0600. Revisiones 1–3 y candidate están retirados.

Supabase permanece **sin escrituras por instrucción de esta fase**; no hay una escritura denegada, pendiente o de resultado incierto. La lectura inicial sin red falló por DNS en sandbox y se completó mediante acceso de solo lectura autorizado. No se enviaron WhatsApp, pedidos ni llamadas OpenAI; tampoco hubo deploy, restart o push.

SHA-256 del catálogo: `23bb6afd7c5541e6f2659d02d9ca44171b0591b62fa365b4bc15cbfd9d78bd6b`.

SHA-256 del SQL final: `121c83be502cf89f88d3c75449ddfbaa5b3d51e729376a789ada144ad601e555`.
