#!/usr/bin/env python3
"""Render final safe R4 batch and explicit unresolved identity decisions, offline."""
import collections, datetime, hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/reports/classification-2026-10-28'
load = lambda n: json.loads((OUT / n).read_text())
write_json = lambda n, v: (OUT / n).write_text(json.dumps(v, ensure_ascii=False, indent=2) + '\n')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
coverage = load('coverage.json')
summary = load('summary.json')
pending = [r for r in coverage if r['pending']]
checks = load('behavior-validation.json')
readback = load('remote-recheck.json')
baseline = {r['local_key']: r for r in load('revision-3/coverage.json')}
previous_pending = {r['local_key'] for r in load('revision-3/research-pending-r3.json')}
tests = (OUT / 'tests.r4.txt').read_text()
sql_tests = (OUT / 'sql-validation.r4.txt').read_text()
sql = (OUT / 'apply-supabase.sql').read_text()
assert 'pass 921' in tests and 'fail 0' in tests
assert '13 SQL integration scenarios passed.' in sql_tests
assert sql.startswith('-- VERSION: clasificacion-20261028-r4\n')
assert summary['protected_fields_unchanged'] and readback['unchanged']
assert (ROOT / 'productos.json').read_bytes() == (OUT / 'productos.candidate.json').read_bytes()
assert len(coverage) == 1121 and len(pending) == 220
assert all(r.get('manual_disposition', {}).get('required') for r in pending)

def esc(value):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    return str(value if value is not None else 'null').replace('|', '\\|').replace('\n', ' ')

def table(headers, rows):
    return ('| ' + ' | '.join(headers) + ' |\n| ' + ' | '.join(['---'] * len(headers)) + ' |\n'
            + ''.join('| ' + ' | '.join(esc(c) for c in row) + ' |\n' for row in rows))

attempts = {r['local_key']: [] for r in coverage}
for path in sorted((OUT / 'evidence').glob('*.json')):
    try:
        data = json.loads(path.read_text())
    except (ValueError, OSError):
        continue
    if not isinstance(data, dict) or not isinstance(data.get('keys'), str):
        continue
    for key in data['keys'].split():
        if key in attempts:
            attempts[key].append({'file': 'evidence/' + path.name, 'query': data.get('q')})

consolidated = []
for r in coverage:
    key = r['local_key']
    if key not in previous_pending:
        continue
    old = baseline[key]
    changed = (old['classification_after'] != r['classification_after']
               or old['declared_species_after'] != r['declared_species_after'])
    state = ('requiere_dato_o_decision' if r['pending'] else
             'corregida_con_evidencia' if changed else 'datos_existentes_correctos')
    consolidated.append({
        'local_key': key, 'name': r['name'], 'codes': r['codes'], 'remote_id': r['remote_id'],
        'state': state, 'changed_in_consolidation': changed,
        'classification_r3': old['classification_after'], 'classification_r4': r['classification_after'],
        'declared_species_r3': old['declared_species_after'], 'declared_species_r4': r['declared_species_after'],
        'pending': r['pending'], 'manual_disposition': r.get('manual_disposition'),
        'evidence_decisions': r['evidence_decisions'], 'attempts': attempts[key]})
states = dict(collections.Counter(r['state'] for r in consolidated))
assert len(consolidated) == 256
assert states == {'requiere_dato_o_decision': 220, 'corregida_con_evidencia': 35, 'datos_existentes_correctos': 1}
write_json('consolidacion-256.json', consolidated)
write_json('research-pending-r3.json', consolidated)

kinds = {
    'etiqueta_del_stock': 'Etiqueta del stock y destino autorizado',
    'identidad_o_presentacion': 'Identidad, fórmula o presentación exacta',
    'divergencia_sin_identidad': 'Divergencia local/remota sin identidad suficiente',
    'declaracion_nutricional': 'Declaración de alimento completo o complementario',
    'modelo_por_presentacion': 'Variantes incompatibles agrupadas en una referencia',
    'limite_taxonomia': 'Conejos y límite de taxonomía actual',
    'identidad_remota_ausente': 'Identificador remoto ausente como problema principal',
}
kind_counts = dict(collections.Counter(r['manual_disposition']['kind'] for r in pending))
group_table = table(['Dato o decisión principal', 'Referencias'], [(label, kind_counts.get(k, 0)) for k, label in kinds.items()])
status = '**R4 FINAL DEL LOTE SEGURO. Supabase: cero escrituras. Quedan 220 referencias con incertidumbre documentada.**'
manual_sections = []
for kind, label in kinds.items():
    rows = []
    for r in pending:
        d = r['manual_disposition']
        if d['kind'] != kind:
            continue
        questions = [q for q in r['pending'] if q['field'] == 'sincronizacion']
        rows.append((r['local_key'], r['name'], r['codes'], r['remote_id'] or 'SIN ENLACE',
                     [q['field'] for q in r['pending']], d['reason'], d['required'], questions,
                     [a['file'] for a in attempts[r['local_key']]]))
    manual_sections.append('## ' + label + '\n\n' + table(
        ['Índice', 'Producto', 'Códigos', 'UUID', 'Campos', 'Por qué no se decide',
         'Dato o decisión necesaria', 'Pregunta adicional de sincronización', 'Evidencia/consultas archivadas'], rows))
(OUT / 'REVISION-MANUAL.md').write_text('# Revisión manual R4\n\n' + status + '\n\n'
    '220 referencias / 224 preguntas. Todas tienen un desenlace explícito. Una especie no documentada no equivale a error confirmado ni a uso universal. Se conserva el campo dudoso; pueden existir correcciones seguras en otros campos de la misma referencia. Los índices locales corresponden al respaldo original y no sustituyen UUID.\n\n'
    'Las consultas archivadas permiten auditar los intentos; no todas constituyen evidencia positiva. La evidencia revisada no resuelve estas identidades, y no se afirma haber agotado toda fuente posible. Los campos opcionales o no aplicables se separan en DATOS-OPCIONALES.md.\n\n'
    + group_table + '\n' + '\n'.join(manual_sections))

rows = []
for r in coverage:
    for label, key in [('Local: aplicado', 'local_delta'), ('Supabase: propuesto, NO aplicado', 'remote_delta')]:
        for field, value in r[key].items():
            rows.append((label, r['local_key'], r['name'], r['remote_id'], field,
                         value['before'], value['after'], value['confidence'], value['reason'], value['source']))
(OUT / 'CAMBIOS.md').write_text('# Cambios R4\n\n' + status + '\n\n'
    'Antes/después respecto a cada respaldo. Solo campos de clasificación y metadata.especies; las otras claves de metadata se conservan.\n\n'
    + table(['Estado', 'Índice', 'Producto', 'UUID', 'Campo', 'Antes', 'Después', 'Confianza', 'Motivo', 'Fuente'], rows))
notes = [r for r in coverage if r['classification_notes']]
(OUT / 'DATOS-OPCIONALES.md').write_text('# Campos opcionales y límites R4\n\n' + status + '\n\n'
    'Etapa puede ser nula cuando no aplica. Otro no significa perro y gato. metadata.especies solo se añade cuando la evidencia cubre la referencia completa. No se añade a pañoletas ni a Baytril agregado. Las notas pueden coexistir con una pregunta real; no todas son inconsistencias.\n\n'
    + table(['Índice', 'Producto', 'Especie plana', 'Especies declaradas', 'Notas'],
            [(r['local_key'], r['name'], r['classification_after']['especie'], r['declared_species_after'], r['classification_notes']) for r in notes]))
sources = sorted({v['source'] for r in coverage for v in r['evidence_decisions'].values() if 'http' in v['source']})
write_json('sources.json', {'consulted_date': '2026-10-28', 'sources': sources,
    'note': 'Fuentes de decisiones aplicadas. Los intentos archivados no prueban identidad ni agotamiento de fuentes; ver consolidacion-256.json y REVISION-MANUAL.md.'})

local = {r['local_key'] for r in coverage if r['local_delta']}
remote = {r['local_key'] for r in coverage if r['remote_delta']}
missing = [r for r in coverage if not r['remote_id']]
manifest = {
    'version': 'clasificacion-20261028-r4', 'status': 'LOTE_SEGURO_LISTO_CON_PENDIENTES_DOCUMENTADOS',
    'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'catalog_sha256': sha(ROOT / 'productos.json'), 'sql_sha256': sha(OUT / 'apply-supabase.sql'),
    'local_changes': summary['local_changed_references'], 'local_changed_fields': summary['local_changed_fields'],
    'remote_proposed': summary['remote_planned_references'], 'remote_proposed_fields': summary['remote_planned_fields'],
    'supabase_applied': False, 'pending_references': len(pending), 'pending_questions': summary['pending_questions'],
    'consolidation_256': states, 'pending_primary_groups': kind_counts,
    'full_tests_passed': 921, 'sql_scenarios_passed': 13,
    'strict_filter_checks': checks['strict_filter_checks'], 'quote_checks': checks['quote_checks'],
    'remote_read_at': readback['checked_at'], 'remote_snapshot_unchanged': readback['unchanged'],
    'protected_fields_unchanged': summary['protected_fields_unchanged'],
    'safe_sql': 'apply-supabase.sql', 'rollback': 'Guardar celda rollback_sql producida por ejecución; contiene estado posterior real y guardas.'}
write_json('FINAL.json', manifest)

(OUT / 'EJECUCION-SUPABASE.md').write_text('''# Ejecución de clasificación R4

El lote está listo para aplicar, pero todavía NO se ha aplicado a Supabase. Hay 374 referencias propuestas. Los campos dudosos se conservan; no deben resolverse por suposición antes de ejecutar.

1. Usar exclusivamente `apply-supabase.sql`, versión `clasificacion-20261028-r4`. Verificar su SHA-256 en `FINAL.json`. Las revisiones anteriores y el archivo candidate están retirados.
2. Ejecutar el archivo completo en el SQL Editor del proyecto correcto con un rol ya autorizado. No quitar guardas ni ejecutar fragmentos. No cambia permisos, RLS ni esquema permanente.
3. El script valida tenant Distrifinca, UUID, marca, estado previo completo y presentaciones; bloquea filas y modifica únicamente clasificación. Cualquier diferencia concurrente cancela todo el lote. Ante error, ejecutar `ROLLBACK;`, conservar el mensaje y volver a auditar el estado actual antes de generar otro lote.
4. El resultado final debe contener `referencias_verificadas = 374`, `lectura_posterior` y `rollback_sql`. Guardar las tres celdas completas fuera de la sesión del editor. La lectura posterior corresponde al estado realmente verificado dentro de la transacción.
5. La celda `rollback_sql` es el script completo de reversión, generado con los timestamps reales posteriores. Guardarlo como `rollback-clasificacion-r4.sql`; para revertir ejecutar su contenido completo. Rechaza cambios concurrentes y restaura clasificación, conservando precios, nombres, presentaciones y otros metadatos. El timestamp de actualización cambia de forma normal por el trigger. No existe un rollback estático equivalente con timestamps futuros desconocidos.

La misma aplicación no debe repetirse: abortará por estado previo divergente o tabla temporal existente. Si el editor pierde la conexión tras ejecutar, comprobar el resultado por UUID antes de reintentar; no asumir que falló. Los respaldos originales están en `productos.before.json` y `supabase.before.json`, con permisos 0600. Para restaurar localmente, comprobar primero que no haya modificaciones posteriores; no copiar el respaldo sobre trabajo concurrente.

Pruebas offline: 13 escenarios PostgreSQL/PGlite, incluido apply, rollback, concurrencia, precio, metadata, nueva presentación y tenant ajeno. No equivalen a una ejecución productiva. Supabase se leyó sin cambios respecto al respaldo el ''' + readback['checked_at'] + '. Las guardas comprueban de nuevo la vigencia al ejecutar.\n')

report = f'''# Auditoría final de clasificación — R4

{status}

Se revisaron **{summary['local_references']} referencias, {summary['local_presentations']} presentaciones y {summary['local_brands']} grupos**. Se aplicaron localmente **{summary['local_changed_references']} correcciones de referencia / {summary['local_changed_fields']} campos**. El SQL final propone **{summary['remote_planned_references']} referencias / {summary['remote_planned_fields']} campos** de Supabase. No se ha escrito en la base de datos.

## Consolidación y cobertura

Las 256 pendientes de R3 tienen desenlace: **35 corregidas con evidencia, una ya correcta y 220 requieren dato o decisión**. SINSONTES Y TUR (341:0) mantiene su clasificación de alimento para aves. Hubo 37 referencias modificadas durante esta consolidación: 35 quedaron resueltas y dos (Mungos MultiVit/Mobility) recibieron una corrección segura de categoría, conservando pendiente la especie. No queda ninguna marcada como «por consolidar».

Las 220 restantes no son 220 errores confirmados: incluyen desconocimiento de destinatario, variantes sin identificar y decisiones que exigen separar entidades o ampliar taxonomía. En 18 hay correcciones acumuladas en campos comprobados, conservando el campo dudoso. Todas tienen razón y dato requerido por referencia en [REVISION-MANUAL.md](REVISION-MANUAL.md), código y UUID cuando existe. [consolidacion-256.json](consolidacion-256.json) contiene el desenlace anterior/nuevo y las consultas archivadas.

{group_table}

## Criterios y hallazgos corregidos

- Categoría representa la naturaleza comercial del producto; especie identifica destinatario. Se reutilizan las categorías y subcategorías admitidas sin crear enums ni modificar esquema.
- Pañoletas (283:0 y 283:1): `perro/comida/concentrado` pasa a `otro/accesorio/accesorio`. No hay evidencia suficiente de exclusividad canina ni de aptitud universal: la especie y talla siguen requiriendo etiqueta. No se declaró perro/gato por ambigüedad.
- Se corrigieron especies felinas en referencias identificadas de Gatsy, Félix, Oh Mai Gat, Hill's FEL, Royal y Virbac. Alimento dietético sigue siendo comida; golosinas y carnazas se distinguen de alimento completo.
- Se separaron utensilios, juguetes, higiene, suplementos y medicamentos. Ration, Klerat y Sinrat ambientales no son alimentos. Sanuch 15 g se clasifica como antiparasitario. Shampoo insecticida y collar antipulgas no se tratan como higiene ordinaria.
- Evidencia de fabricante por variante: Bolfo polvo 100 g/shampoo 100 mL, Cardio B+E, Clorhexin, Sedan PET, Sutrim, Miclor/Peroxy Proc, Canatox y Novacan T. No se extendieron estas conclusiones a otras concentraciones o formatos pendientes.
- C-Thyro Tabs 0,2–0,8 mg: destino canino respaldado por etiqueta Lloyd/DailyMed. Revolution 6 % para menos de 2,5 kg tiene perro/gato explícito; la referencia de 0,25 mL sin concentración no hereda ese destino.
- Baytril agrupa 150 mg canino y 50 mg canino/felino. No se añade gato a toda la referencia. La representación por presentación exige un cambio fuera del alcance. Igual criterio para los otros tres casos con variantes incompatibles.

Cambios locales por campo: {json.dumps(summary['local_field_changes'], ensure_ascii=False)}. Las 28 correcciones de etapa son clasificación, basadas en indicaciones explícitas y retirada de la falsa etapa en arena KITTEN. Se usan valores multiespecie ya interpretados por el agente y 26 listas `metadata.especies` documentadas. Se preservan las demás claves de metadata.

## Datos protegidos y correspondencia remota

Nombres, marcas, precios, pesos, identificadores, textos, confirmación, presentaciones y demás atributos permanecen iguales al respaldo. La auditoría verifica invariancia estructural. No se modificó la lógica ni arquitectura del agente para esta revisión; los cambios previos de reconocimiento/handoff se preservaron.

Hay {summary['bound_references']} enlaces únicos: 1115 por códigos comerciales y uno por igualdad exacta compuesta (AGILITY GRAND CACH, sin cambios). No se emparejó por nombre aproximado. Se excluyen once referencias remotas inactivas sin contraparte. Se conservan 37 diferencias previas de nombre/marca. Los UUID y tenant se vuelven a validar en SQL.

Las listas de cambios tienen **{len(local & remote)} referencias comunes, {len(local - remote)} solo locales y {len(remote - local)} solo remotas**. Se comparan contra estados previos distintos; algunas correcciones ya estaban presentes en uno de los catálogos. Los conteos anteriores 184/202, 220/240 y 309/337 eran revisiones parciales y quedan sustituidos por R4.

Cinco referencias no tienen enlace remoto seguro y se excluyen del SQL (dos tienen otra causa principal en la tabla anterior):

{table(['Índice', 'Producto', 'Códigos'], [(r['local_key'], r['name'], r['codes']) for r in missing])}

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
- Lectura remota de solo lectura: **{readback['checked_at']}**, 1127 referencias, sin cambios frente al respaldo: [remote-recheck.json](remote-recheck.json). Las guardas vuelven a verificar vigencia al ejecutar.

Límite preexistente comprobado: la consulta directa por nombre puede cotizar una pañoleta para gato sin especie documentada; ocurre también con el respaldo original. Los filtros estrictos sí respetan los destinos declarados. La corrección de datos no promete bloquear todas las rutas de cotización por compatibilidad; cambiar ese comportamiento sería otra tarea.

## Entrega y ejecución

La única versión aplicable es [apply-supabase.sql](apply-supabase.sql), **clasificacion-20261028-r4**. [EJECUCION-SUPABASE.md](EJECUCION-SUPABASE.md) explica aplicación y reversión. Usa una transacción con bloqueos, estado previo completo, ID/tenant, conteos y verificación posterior. El resultado final incluye lectura posterior y el script `rollback_sql` con timestamps reales; guardar esa celda completa. No se utilizó PATCH REST ni se alteró RLS o permisos.

[CAMBIOS.md](CAMBIOS.md), [coverage.json](coverage.json), [local-changes.json](local-changes.json) y [remote-plan.json](remote-plan.json) registran evidencia, confianza y valores antes/después. [DATOS-OPCIONALES.md](DATOS-OPCIONALES.md) separa notas y campos no aplicables. [FINAL.json](FINAL.json) identifica versión y hashes. Respaldos originales: `productos.before.json` y `supabase.before.json`, permisos 0600. Revisiones 1–3 y candidate están retirados.

Supabase permanece **sin escrituras por instrucción de esta fase**; no hay una escritura denegada, pendiente o de resultado incierto. La lectura inicial sin red falló por DNS en sandbox y se completó mediante acceso de solo lectura autorizado. No se enviaron WhatsApp, pedidos ni llamadas OpenAI; tampoco hubo deploy, restart o push.

SHA-256 del catálogo: `{manifest['catalog_sha256']}`.

SHA-256 del SQL final: `{manifest['sql_sha256']}`.
'''
(OUT / 'INFORME.md').write_text(report)
print(json.dumps({'version': manifest['version'], 'covered': len(coverage), 'local_corrected': len(local),
                  'remote_proposed': len(remote), 'pending_documented': len(pending), 'consolidation': states,
                  'supabase_applied': False}, ensure_ascii=False))
