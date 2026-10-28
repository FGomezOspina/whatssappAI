# Checkpoint parcial R3 — 2026-10-28 17:38 UTC

La tarea sigue abierta. **No ejecutar SQL r2.** El archivo raíz apply-supabase.sql contiene una excepción bloqueante y no el payload de actualización. Supabase: cero escrituras intentadas/aplicadas. No hay procesos pendientes ni escrituras inciertas.

## Estado verificable

- Catálogo real conserva r2: 220 referencias corregidas, hash f900048df4a642dba88b1da6fcd382e6789ccb28ba2a489f0583807664ee6e40. No se aplicaron las decisiones R3 todavía.
- R3: 77 decisiones, 80 referencias del conjunto anterior de 367 pendientes. Además, 7 preguntas de objetos físicos opcionales se eliminan por la corrección del patrón pañal/cortauñas.
- Simulación offline en carpeta temporal: 279 referencias locales con cambios acumulados, 445 campos; 299 referencias remotas propuestas, 487 campos. No se generó SQL final R3.
- Pendientes proyectados: 280 referencias, 285 preguntas: 52 variantes/clasificaciones, 202 destinos aún no documentados, 23 divergencias local/remoto, 5 identidades remotas ausentes y 3 límites conejo/roedor. Las preguntas restantes todavía requieren consolidar la investigación; no se presentan como irreducibles.
- 503 archivos de intentos web con claves de referencias; cubren 349 de las 367 pendientes originales. Otras cinco referencias resueltas al inicio tienen su fuente en third-review-decisions.json (Advance, Agility Obesos, Equilibrio Light, Royal Hepatic, Virbac KJ2). Los 13 restantes son siete objetos físicos, tres casos conejo/roedor y tres ausencias de ID que no requieren búsqueda de fabricante.
- La simulación verifica igualdad de todos los campos protegidos y vínculos uno a uno; no sustituye los tests finales. Última suite realmente ejecutada: r2 921/921 y 11 pruebas SQL. Falta repetir para R3.

## Entregables del checkpoint

- third-review-decisions.json: decisiones nuevas con fuente, motivo y campo permitido.
- research-r3-index.json y evidence/: consultas y respuestas, incluidas búsquedas sin resultado.
- CHECKPOINT-R3.json: conteos, estado y hash.
- checkpoint-r3-projected-summary.json / checkpoint-r3-projected-pending.json: simulación aislada. No confundir con summary.json/pending.json raíz, que aún reflejan r2.

## Hallazgos principales

- Sanuch 15 g es antiparasitario, no comida húmeda.
- Biocanis, Ativi y Condromax Pet son suplementos para perros y gatos.
- Mometax y Gentax ótico tienen indicación canina en las fichas consultadas; no se acepta agregar gatos desde vendedores.
- Marboquin 5/25/50, Descensor 200, Galgocal 200/600 y Quinocalf 25/50 cuentan con fichas explícitas.
- Felinnex tiene especie felina documentada; se preserva el nombre PASTA y no se cambia su presentación unidad.
- Baytril agrupa 150 mg canino y 50 mg canino/felino. Pendiente documentar esta limitación por presentación; no debe asignarse ambas especies a todas las variantes sin distinción.
- `otro` NO es comodín en `admiteEspecie`. Pañoletas y productos multiespecie documentados pueden recuperarse por nombre, pero se excluyen de filtros estrictos perro/gato. Falta prueba de comportamiento offline y exposición clara en informe. No se modificó lógica.

## Continuación prioritaria, sin repetir búsquedas

1. Revisar fuentes ya guardadas: Ration 20 g tiene publicación oficial de Chalver que lo identifica como rodenticida (evidence/r3-food-19.json), aún no trasladada a decisiones. Retirar clasificación comida con evidencia exacta.
2. Consolidar Natural Freshly con páginas oficiales petsandcats.com.co; se descubrió catálogo 2026 PDF de 30 MB en /tmp/natural-freshly-2026.pdf. Es escaneado, PDFKit no extrae texto. No hay que repetir descarga ni tratar el texto vacío como evidencia negativa. Las páginas web oficiales sí están disponibles, incluidos Digestar 12 sobres, Mieltertos 180 ml, Omega 3-6-9 50 cápsulas, Urovital 50 y Derma Clean 56 g. Evidencia checkpoint-r3-fresh-products.json y r3-source-sites.json.
3. Revisar restantes resultados primarios de fabricantes y Soy del Campo (su aviso legal atribuye información al fabricante/importador): r3-label*, r3-label2*, r3-spec*, r3-confirm*. No equiparar navegación de especies con indicación del producto. No extrapolar concentración/formato/país.
4. Investigaciones alimentarias aún pendientes: r3-food-*. Royal Beauty aparece oficialmente en lata 5.2 oz; no confundir gramos de tabla de ración con peso del envase. Taste Pato puede ser Wetlands canino o Lowland Creek felino; necesita línea. Taste lata 156 g coincide con formatos felinos, pero confirmar que todas las variantes candidatas coincidan. Pet Milk local 100/250/500 g no coincide plenamente con 100/300 g oficiales; no reasignar peso ni fabricante por marca incompleta.
5. Clasificar cada pendiente con fuente consultada y dato concreto ausente; las 280 no están aún cerradas como preguntas irreducibles. Retirar preguntas artificiales de subcategorías opcionales y resolver campos comunes entre variantes sin inventar el nombre comercial.
6. Al aplicar auditoría usar --apply-local con guarda actual; el candidato raíz aún es r2. Simulación de checkpoint se hizo en /tmp y no alteró candidato raíz. Regenerar SQL r3, validar 11 escenarios, tests completos, nueva lectura remota, guardas y hash final. Mantener bloqueado apply-supabase.sql hasta cerrar validación.

No se tocaron los cambios previos de reconocimiento/handoff. No WhatsApp, pedidos, OpenAI, despliegues ni reinicios.
