# Auditoría del catálogo — checkpoint R3

**R3 EN REVISIÓN. NO EJECUTAR SQL. Supabase: cero escrituras.**

Se cubrieron 1121 referencias, 1397 presentaciones y 392 grupos. El archivo local acumula **309 referencias corregidas / 494 campos** respecto al respaldo original. El plan remoto propone **337 referencias / 545 campos**. No se ha actualizado Supabase.

## Alcance y datos protegidos

Cambios locales por campo: {"especie": 181, "subcategoria": 153, "etapa": 28, "metadata.especies": 16, "categoria": 116}. Etapa es clasificación: 28 correcciones por términos explícitos y eliminación de falsa etapa en arena KITTEN. La lista `metadata.especies` ya existía en el agente; no se modificó lógica ni esquema para usarla. Todos los otros metadatos, nombres, marcas, precios, pesos, IDs, textos, confirmación y presentaciones permanecen iguales al respaldo. La auditoría compara estructuralmente cada campo protegido. Se preservan los cambios anteriores de reconocimiento/handoff.

## Hallazgos

- Pañoletas: `perro/comida/concentrado` pasa a `otro/accesorio/accesorio`. No hay prueba de destinatario exclusivo ni de ajuste universal; no se asignó una lista perro/gato.
- Ration 20 g, Klerat y Sinrat son productos ambientales, fuera de alimento. Sanuch 15 g es antiparasitario, no alimento húmedo.
- Se corrigieron especies felinas en líneas identificadas de Gatsy, Félix, Oh Mai Gat, Hill's FEL, Royal y Virbac, preservando marcas y nombres.
- Biocanis, Artri Balance, Ativi, Condromax, Omega 3-6-9 y Mieltertos tienen clasificación de suplemento respaldada. Alimentos dietéticos siguen siendo comida.
- Shampoo/jabón insecticida CanAmor y collar Kiltix se distinguen de higiene ordinaria. Las especies no se extrapolan entre medicamentos parecidos.
- Unikat 4/18 kg y arenas Michiko tienen destino felino documentado. Delidog 156/400 g es húmedo, distinto de snacks Bone/Dent/Mix.
- Baytril agrupa 150 mg canino y 50 mg canino/felino. No se añade gato a la referencia completa. Separar entidades por presentación necesita un cambio fuera de alcance, no más búsqueda de especie.
- Dato protegido detectado: código 104010102017, `CHUNKY DELICAT PAG 3 LLEV 4`, aparece como peso `3 l`. Se conserva ese peso y se propone revisar promoción/peso unitario por separado.

## Pendientes actuales

256 referencias conservan 260 preguntas. La revisión sigue abierta: no se afirma que todas sean irreducibles ni que falte investigar todas desde cero. [REVISION-MANUAL.md](REVISION-MANUAL.md) y [research-pending-r3.json](research-pending-r3.json) enlazan cada referencia con código, UUID, campo, pregunta e intentos archivados.

| Causa | Referencias | Preguntas |
| --- | --- | --- |
| Variante o clasificación | 51 | 51 |
| Destinatario no documentado | 188 | 188 |
| Divergencia local/remota | 13 | 13 |
| Identidad remota ausente | 5 | 5 |
| Límite de taxonomía | 3 | 3 |


## Compatibilidad comprobada

336 comprobaciones de filtros por especie/categoría, pasando por catálogo local, reconstrucción REST y resultado RPC; 3 cotizaciones con precios intactos y carrito vacío. Las listas multiespecie sobreviven a las tres rutas. El filtro estricto excluye perro/gato en pañoletas y Baytril agregado.

Límite comprobado por separado: la ruta de consulta directa por nombre puede cotizar pañoletas para gato aun sin especie documentada. Sucede también con el respaldo original, antes de estas correcciones. Esta tarea no cambia ese comportamiento ni convierte clasificación en autorización clínica o garantía de compatibilidad.

## Correspondencia remota

Tenant exclusivo Distrifinca. 1116 enlaces únicos: 1115 por códigos comerciales y uno por igualdad exacta compuesta (AGILITY GRAND CACH, sin cambios). Once referencias remotas inactivas sin contraparte se excluyen. Hay 37 diferencias previas de nombre/marca que se conservan.

Correcciones locales/remotas: 308 comunes, 1 solo locales y 29 solo remotas. Las remotas adicionales ya estaban correctas localmente; no indican duplicación. La primera revisión tuvo 184/202 y la segunda 220/240; ambas están archivadas.

Cinco referencias sin enlace:

| Índice | Nombre | Códigos |
| --- | --- | --- |
| 113:0 | CREDELIO | ["10601011332", "10601011343"] |
| 115:0 | CUCHUCO | ["10301030520"] |
| 199:0 | IXER | ["102010102040"] |
| 202:0 | JERINGA | ["10601010930", "10601010931", "10601010932"] |
| 287:0 | PET MILK | ["10301011334", "10301011335"] |


Lectura remota guardada: `2026-10-28T17:58:35.394Z`; sin cambios respecto al respaldo: `True`. Las guardas volverán a comprobar todo al ejecutar un lote futuro. No hay escritura productiva pendiente, denegada ni incierta.

## Validación de este checkpoint

Suite completa registrada en [tests.r3.txt](tests.r3.txt). Resultado final de la salida:

```
✔ equivalencia funciona con una marca nueva y la consulta seca excluye pouch (3.291459ms)
ℹ tests 921
ℹ suites 0
ℹ pass 921
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7160.480208
```

Pruebas SQL en PGlite: [sql-validation.r3.txt](sql-validation.r3.txt). Estado: `13 SQL integration scenarios passed. Production unchanged.`. Comprueban reversión real, metadatos ajenos protegidos, aislamiento de tenant, cambios concurrentes y rechazo de segunda ejecución. No son escritura en Supabase.

## Archivos y uso

- [CAMBIOS.md](CAMBIOS.md), [coverage.json](coverage.json), [local-changes.json](local-changes.json), [remote-plan.json](remote-plan.json): valores previos/nuevos, evidencia, confianza, código y UUID.
- `apply-supabase.sql` conserva excepción bloqueante. `apply-supabase.candidate.sql` es solo candidato de prueba; **no ejecutar todavía**. Contiene transacción, locks, guardas por estado completo e ID/tenant, conteos, verificación posterior y generación de reversión con timestamps reales. No se usó PATCH REST.
- `productos.before.json`, `supabase.before.json`: respaldos originales protegidos con permisos 0600.
- `revision-1/`, `revision-2/`: versiones retiradas, no ejecutar.
- Scripts de auditoría y verificación son reproducibles, offline salvo `check-classification-snapshot.cjs` que solo lee. No se enviaron WhatsApp, pedidos ni llamadas OpenAI. No hay despliegue, reinicio o push.

SHA-256 local actual: `31a8a4e12dabaa669ef492b3ea19187e4dc11e31e6b7a0c9942a6c5a20877f47`.
