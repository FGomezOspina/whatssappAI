# Auditoría de clasificación del catálogo — 28 de octubre de 2026

Se revisó el inventario completo de **1121 referencias**, **1397 presentaciones** y **392 agrupaciones de marca**. Se aplicaron **298 cambios de campos en 184 referencias** de `productos.json`. Solo cambiaron especie (84), categoría (87), subcategoría (99) y etapa (28).

**Supabase no se modificó.** Se prepararon **338 cambios en 202 referencias** mediante SQL transaccional. La conexión disponible permite lectura REST; no se encontró conexión PostgreSQL o herramienta de SQL con garantías de transacción para ejecutar el lote. No hubo una denegación de escritura, ni una operación productiva pendiente o de resultado incierto. Se eligió el SQL manual autorizado; no se intentaron PATCH individuales.

**Quedan 580 referencias con dudas o datos pendientes**, detalladas una por una en [REVISION-MANUAL.md](REVISION-MANUAL.md). No se puede afirmar que todas las clasificaciones estén certificadas. Hay 136 corregidas sin preguntas restantes, 48 corregidas con otro atributo pendiente, 532 sin cambios con preguntas pendientes y 405 sin inconsistencia detectada en los datos disponibles. Esta última condición no equivale a certificación del fabricante.

## Entregables

- [CAMBIOS.md](CAMBIOS.md): todas las correcciones, campo, valor previo/nuevo, UUID, razón, confianza y fuente.
- [coverage.json](coverage.json): cobertura de las 1.121 referencias, códigos, clasificación y correspondencia remota.
- [REVISION-MANUAL.md](REVISION-MANUAL.md) y [pending.json](pending.json): lista exacta de preguntas y dato requerido.
- [apply-supabase.sql](apply-supabase.sql): lote ejecutable, prechecks, locks, guardas, comprobación posterior y generación de SQL de reversión.
- [remote-plan.json](remote-plan.json), [remote-unmatched.json](remote-unmatched.json), [sources.json](sources.json).
- [tests.after.txt](tests.after.txt), [sql-validation.txt](sql-validation.txt), [remote-recheck.json](remote-recheck.json).
- `productos.before.json` y `supabase.before.json`: copias de partida con permisos 0600. Sin credenciales ni conversaciones/clientes personales.

## Hallazgos y criterios

- **Pañoletas ECO/PREMIUM** estaban como `perro / comida / concentrado`; quedaron `otro / accesorio / accesorio`. La función es clara, pero faltan etiqueta/talla para asegurar especies. `otro` representa destinatario sin determinar, no autorización universal.
- Huacales, comederos, rodilleras y traíllas no son alimentos; juguetes chillones no son snacks. Unificamos accesorios físicos, juguetes y útiles de higiene según función.
- **Klerat y Sinrat** son rodenticidas ambientales: `otro`, fuera de alimento. **FINCUC** se retiró de alimento/medicamento hacia `otro`; aún requiere etiqueta por variante y registro, como se indica en la lista manual. No se dedujo una especie de mascota a partir de la plaga objetivo.
- Alimentos terapéuticos **Hill’s Metabolic** siguen siendo `comida`; **Agility EN Gato 140 g**, Instinctive 85 g y Monge Recovery son húmedos; una lata de TetraColor contiene alimento seco para peces. Envase no determina formato nutricional.
- **Gatsy, Félix, Oh Mai Gat, Royal Persian/Fit, Hill’s FEL y Hairball 7+** se corrigieron como felinos cuando la línea exacta está identificada. **Milpro 16 mg** es felino; **Pezosan** no es un producto para peces por su prefijo.
- **Canisan D/F, Amigo Calcio, Epiotic, Brillo Clean Eyes, Entero-Chronic y Hill’s A/D** tienen evidencia de uso en perros y gatos. Se usó el valor multiespecie ya soportado `perro y gato`.
- **FortiFlora, Amigo, Calmurofel, Glicopan, Hemolitan y Organew**: se distinguieron suplementos de medicamentos según variante documentada, sin inferir especies no documentadas para el SKU.
- **Credelio felino** es medicamento antipulgas, no accesorio. Su UUID remoto no existe en la correspondencia por código: no se confundió con Credelio canino.
- `aves` se normalizó a `ave`. Las vacunas pasaron a `medicamento / biologico`, compatible con los filtros existentes. Se mantuvieron las categorías de arena, snack, higiene y juguete; no se crearon enums o esquema nuevos.
- Etapa se normalizó solo por nombre inequívoco (cachorro/puppy/gatito/adulto/senior/7+). KITTEN como parte del nombre de una arena no implica uso exclusivo por cachorros.
- Conejos: tres referencias permanecen pendientes porque el agente actual los agrupa dentro de `roedor`; corregir esa taxonomía biológica requiere una decisión fuera de la modificación de datos autorizada. ReptoMin Tortugas quedó `otro`: reptil no está representado en el esquema actual.

## Integridad y correspondencia con Supabase

Tenant exclusivo: `distrifinca`, UUID `1d2d79c4-19e0-4a6d-83f1-cf714ee7618b`.

Supabase contiene 1127 referencias y 1423 presentaciones. Se vincularon 1116 referencias locales: 1.115 por códigos comerciales únicos de presentación, y AGILITY GRAND CACH por igualdad exacta compuesta de marca/nombre/nombres de origen; esta última no tiene cambios. Se verificó correspondencia uno-a-uno; ningún UPDATE se vincula por nombre aproximado. Hay 11 referencias remotas sin contraparte local, inactivas y excluidas del lote.

Cinco referencias locales sin coincidencia por código:

| Índice | Producto | Códigos |
| --- | --- | --- |
| 113:0 | CREDELIO | 10601011332, 10601011343 |
| 115:0 | CUCHUCO | 10301030520 |
| 199:0 | IXER | 102010102040 |
| 202:0 | JERINGA | 10601010930, 10601010931, 10601010932 |
| 287:0 | PET MILK | 10301011334, 10301011335 |


Hay **26 referencias con divergencias previas local/remoto todavía no justificadas**. Se reportan con ambos valores en la lista manual y no se sobrescriben. El lote remoto no copia ciegamente todos los valores locales: solo decisiones expresas con evidencia. Por eso sus conteos difieren de las correcciones locales.

La comparación estructural verifica que nombres, marcas, textos comerciales, precios, IDs, pesos, presentaciones, metadatos y el resto de campos no cambian. Los campos `requires_confirmation` y `active` tampoco cambian. Se preservaron las modificaciones anteriores de reconocimiento/handoff. No se cambiaron archivos de ejecución del agente, arquitectura, RLS ni esquema.

Algunos datos protegidos requieren una revisión independiente (ejemplo: Pezosan descrito como 30 mg, frente a ungüento del fabricante; Barkfresh 515 kg). Se conservan y no se utilizan para inventar una clasificación.

## Validación

- Suite previa: **921/921**. Suite final: **921/921**, 0 fallos, 0 omitidas. Incluye matching, búsqueda, formatos, especies, carrito, cotización y continuidad.
- La primera ejecución posterior detectó un test que seleccionaba el primer Credelio con categoría medicamento, suponiendo implícitamente que era canino. Se corrigió **solo ese selector de prueba** en `test/weightRanges.test.js` para exigir `especie === 'perro'`. No se alteró lógica de producción ni se suavizó una expectativa de rango.
- **11 escenarios de integración SQL** en PostgreSQL local (PGlite): lote exacto, aislamiento de otro tenant, campos protegidos, reejecución rechazada, rollback real y abortos íntegros por cambios de categoría, timestamp, nombre, tenant, referencia faltante, precio y variante nueva. Reversión también rechaza cambios posteriores.
- `git diff --check` sin errores. Validación offline de taxonomías y comparación estructural completa.
- Lectura remota final: 1.127 referencias, sin IDs cambiados ni eliminados respecto al respaldo. **Cero escrituras productivas**. Sin mensajes de WhatsApp, pedidos, llamadas OpenAI, despliegue, reinicio ni push.

## Aplicar el SQL y revertir

1. Revisar [CAMBIOS.md](CAMBIOS.md) y abrir `apply-supabase.sql` en SQL Editor del proyecto correcto con un rol ya autorizado. Ejecutar el archivo completo. No ejecutar el importador general de productos.
2. El script exige tenant, IDs, estado completo previo de referencias, marcas y presentaciones; bloquea filas en orden y actualiza únicamente los cuatro campos autorizados. Cambios concurrentes, valores inesperados, RLS/permisos insuficientes o conteo distinto abortan toda la transacción. Ante error, ejecutar `ROLLBACK;` si la sesión quedó abortada; investigar y regenerar con un respaldo nuevo. No borrar las guardas.
3. Tras COMMIT deben aparecer `202` referencias verificadas y sus valores. **Guardar completa la celda `rollback_sql`** que produce la misma ejecución. Contiene un script autónomo ejecutable con los UUID, tenant, estado anterior y los timestamps posteriores reales. No puede emitirse esa reversión definitiva antes de la ejecución porque sus timestamps aún no existen.
4. Para revertir, ejecutar esa celda guardada como un script completo. Verifica que las referencias y sus presentaciones sigan exactamente como quedaron; si hubo cambios posteriores, aborta en lugar de pisarlos. El trigger normal actualiza `updated_at`; no se fuerza un timestamp histórico.
5. Repetir lectura/verificación del catálogo y pruebas del entorno antes de cualquier despliegue. Este trabajo no ejecuta ni programa ese despliegue.

## Reproducibilidad local

`python3 scripts/audit-catalog-classification.py` regenera inventario, candidato y deltas desde las copias. `--apply-local` exige el respaldo o un candidato previo exacto y evita sobrescribir edición concurrente. `python3 scripts/build-classification-sql.py` regenera el lote sin conexión. `node scripts/verify-classification-sql.cjs` usa PGlite existente en `/tmp/veltia-sql-test/node_modules/@electric-sql/pglite` (se puede indicar `PGLITE_MODULE`), sin instalar dependencias del proyecto. `node scripts/check-classification-snapshot.cjs` solo lee el catálogo con la configuración existente; no muestra secretos.

Hash SHA-256 del respaldo local: `05ff7c8cb9e080946b2e53c8448aac2f774413dee6955c3c1a886066e220be6c`.
Hash SHA-256 de `productos.json` corregido: `ae09bd7d1ffa18c9265d1d9d7cb4222606d4a445a1411921ee6ec70195b922a2`.

## Distribución de clasificación

| Categoría | Antes | Después |
| --- | --- | --- |
| accesorio | 169 | 164 |
| arena_sustrato | 26 | 25 |
| comida | 461 | 438 |
| higiene | 80 | 94 |
| juguete | 19 | 24 |
| medicamento | 299 | 283 |
| otro | 0 | 9 |
| snack | 56 | 71 |
| suplemento | 3 | 13 |
| vacuna | 8 | 0 |

| Especie | Antes | Después |
| --- | --- | --- |
| ave | 13 | 16 |
| aves | 1 | 0 |
| gato | 237 | 285 |
| otro | 493 | 479 |
| perro | 365 | 320 |
| perro y gato | 2 | 11 |
| pez | 4 | 4 |
| roedor | 6 | 6 |

