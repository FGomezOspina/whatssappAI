#!/usr/bin/env python3
"""Auditoría puntual, reproducible y offline. No escribe en Supabase.

Sin argumentos genera candidato, cobertura y deltas. --apply-local aplica solo
campos de clasificación si el archivo conserva exactamente el hash de partida.
Las decisiones son de esta revisión, no reglas nuevas del agente.
"""
import collections, copy, hashlib, json, pathlib, re, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/reports/classification-2026-10-28'
FIELDS = ['especie', 'categoria', 'subcategoria', 'etapa']
SPECIES_LIST = 'metadata.especies'
REMOTE_FIELDS = dict(zip(FIELDS, ['species', 'category', 'subcategory', 'life_stage']))
raw = (OUT / 'productos.before.json').read_bytes()
previous_candidate = (OUT / 'productos.candidate.json').read_bytes() if (OUT / 'productos.candidate.json').exists() else None
original = json.loads(raw)
catalog = copy.deepcopy(original)
snapshot = json.loads((OUT / 'supabase.before.json').read_text())
remote = snapshot['refs']
decisions = collections.defaultdict(dict)
questions = collections.defaultdict(list)
confirmed_species = set()
classification_notes = collections.defaultdict(list)
manual_path=OUT/'manual-review-decisions.json'
manual_decisions=json.loads(manual_path.read_text()) if manual_path.exists() else {}

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if not unicodedata.combining(c))

def ref(key, source=catalog):
    b,r = map(int,key.split(':'))
    return source[b]['referencias'][r]

def change(keys, patch, reason, source='productos.json: nombre, descripción y nombres originales', confidence='alta'):
    for key in keys.split():
        r = ref(key)
        for field,value in patch.items():
            assert field in FIELDS or field == SPECIES_LIST
            decisions[key][field] = dict(value=value, reason=reason, source=source, confidence=confidence)
            if field == SPECIES_LIST:
                assert isinstance(value,list) and value and all(isinstance(s,str) and s for s in value)
                assert len(value)==len(set(value))
                r.setdefault('metadata',{})['especies']=value
                confirmed_species.add(key)
            else:
                r[field] = value
        if 'especie' in patch and patch['especie'] != 'otro': confirmed_species.add(key)

def doubt(keys, field, missing):
    for key in keys.split(): questions[key].append(dict(field=field,missing=missing))

def cat(keys, category, subcategory, reason, source='productos.json: nombre, descripción y nombres originales'):
    change(keys,dict(categoria=category,subcategoria=subcategory),reason,source)

# Semántica explícita: objetos físicos no son alimentos ni principios activos.
cat('61:0 61:8 147:7 256:9 256:10 354:0','comida','concentrado','Referencia de alimento seco identificada por línea, etapa y presentación; clasificación ajena al producto.')
change('147:7 256:9 256:10',{'especie':'perro'},'Línea canina explícita (adulto RMG/AMG) y presentaciones del catálogo.')
cat('101:13 151:10 195:8 195:9 195:10 195:11 202:1 283:0 283:1 318:0 365:18 376:0','accesorio','accesorio','Objeto físico: comedero, faja, transportador, jeringa, pañoleta, rodillera, traílla o venda; no alimento ni medicamento.')
change('99:7 195:8 195:9 195:10 195:11 283:0 283:1 318:0',{'especie':'otro'},'Se retira una especie exclusiva sin respaldo; el diseño/nombre genérico no acredita destinatario. No significa apto para todas las especies.')
doubt('99:7 195:8 195:9 195:10 195:11 283:0 283:1 318:0','especie','Etiqueta del fabricante, especie de destino y dimensiones/talla de esta referencia.')
change('101:14 290:1',{'especie':'perro'},'El nombre especifica PERRO/PERRRO; el hueso describe el diseño del comedero, no un snack.')
cat('203:13','juguete','juguete','Juguete hueso chillón: objeto sonoro, no hueso comestible.')
cat('179:0 180:0 181:0 181:1 181:2','juguete','juguete','Gimnasios, túneles y rascadores para enriquecimiento; mismo criterio que los rascadores existentes.')
change('179:0 180:0 181:0 181:1 181:2 307:0 307:1',{'especie':'gato'},'Gimnasio/rascador felino por función comercial explícita; Kitty/rascadores/túnel en nombre.')
cat('109:0 110:0 186:0 281:0 281:1 281:2 281:3 281:4 281:5 353:0','higiene','aseo','Utensilio de aseo o absorbente sanitario; criterio único con cepillos, pañitos y tapetes.')
cat('175:0 216:1 244:15','higiene','aseo','Gel dental, enjuague bucal y perfume: higiene, no concentrado ni medicamento.')
cat('104:0 164:0','otro',None,'Servicio (consulta/flete), no un medicamento. Se usa otro ya admitido sin crear categoría nueva.')
cat('371:0','accesorio','accesorio','Test diagnóstico: insumo veterinario, no medicamento administrable.')
cat('198:0','medicamento','medicamento','Itraconazol: principio activo farmacológico, no accesorio.')
cat('184:0 184:1 286:0 286:1 345:0','snack','premio','Nombre declara golosina, carnaza comestible o snack; no alimento concentrado/completo.')
change('8:0',{'especie':'ave'},'Singular canónico ave; se elimina variante duplicada aves.')
# Etapas: únicamente palabras y abreviaturas inequívocas en la referencia.
for bi,b in enumerate(catalog):
    for ri,r in enumerate(b['referencias']):
        key=f'{bi}:{ri}'; n=norm(r['nombre'])
        if r['categoria'] not in ['comida','snack']: continue
        stage = ('senior' if re.search(r'\b(senior|mayores|mayor|mature)\b|\+7|7\+',n) else
                 'cachorro' if re.search(r'\b(cach|cacho|cachorro[s]?|puppy|pupyy|pupy|filhotes|gatitos?|gaticos|kitten|baby cat)\b',n) else
                 'adulto' if re.search(r'\b(adul|adulrmg|adult|adulto[s]?)\b',n) else None)
        if stage and stage != r.get('etapa'):
            change(key,{'etapa':stage},'Etapa declarada en el nombre; se normaliza abreviatura, inglés o portugués sin cambiar el nombre.')
change('24:0 25:0 26:0 27:0 28:0',{'etapa':None},'KITTEN es parte del nombre de la arena; no demuestra restricción a cachorros.')

# Fuentes primarias consultadas. No se extrapolan usos clínicos ni dosis.
cat('194:17','comida','concentrado','Metabolic canino seco es alimento dietético, no medicamento.','https://www.hillspet.com/dog-food/prescription-diet-metabolic-weight-management-dry')
cat('194:18','comida','concentrado','Metabolic felino seco es alimento dietético.','https://www.hillspet.com/cat-food/prescription-diet-metabolic-weight-management-dry')
change('194:9 194:10 194:11 194:12 194:13 194:14',{'especie':'gato'},'FEL abrevia felino en estas dietas, frente a CAN canino; corroborado por catálogo del fabricante.','https://www.hillspet.es/cat-food')
change('194:8',{'especie':'perro y gato'},'A/D y nombre CAN Y FEL declaran ambas especies.','https://www.hillspet.es/cat-food')
change('174:0 174:1 174:2 174:3 174:4',{'especie':'gato'},'Gatsy carne/pescado son líneas felinas documentadas por fabricante.','https://purina.com.co/gatsy')
change('147:1',{'especie':'gato'},'Excellent Sterilized es la fórmula para gatos esterilizados.','https://purina.com.co/excellent/gatos/sterilized')
change('157:0 157:1 157:3 157:4 157:6 157:7 157:8 157:10',{'especie':'gato'},'Félix Megamix, Triple Delicious, Filetes y Paté son productos felinos del fabricante.','https://purina.com.co/felix')
cat('157:0','comida','concentrado','Megamix es alimento seco felino, no accesorio.','https://purina.com.co/felix/alimento-seco/megamix-adultos')
cat('157:3 157:6 157:7 157:8','comida','comida_humeda','Filetes/paté en 156 g son alimento húmedo.','https://purina.com.co/felix/productos')
change('266:0 266:2 266:3 266:4 266:5 266:6',{'especie':'gato'},'Líneas Caseros, Inquietos y Sedentarios de Oh Mai Gat documentadas para gatos.','https://empresaspolar.com/alimenta-a-tu-gathijo-de-acuerdo-a-su-personalidad-con-oh-mai-gat-de-alimentos-polar/')
change('131:0',{'especie':'gato'},'DonKat adulto: alimento felino.','https://empresaspolar.com/nuestras-marcas/donkat/')
change('131:1 131:2',{'especie':'gato'},'DonKat cremoso pertenece a la línea felina; falta etiqueta para fijar tipo nutricional exacto.','https://empresaspolar.com/nuestras-marcas/donkat/')
doubt('131:1 131:2','categoria/subcategoria','Etiqueta de Donkat Cremoso (complementario/snack frente a alimento completo); no confundir con Donkat seco.')
cat('209:0 340:0','otro',None,'Rodenticida ambiental; no alimento, snack ni medicamento para mascotas. Sin nuevo enum.','https://www.syngentappm.com/uk/product/crop-protection/rodenticide/talonrsoft ; https://www.laboratoriosprovet.com/producto/sinrat-pellets/')
change('209:0 340:0',{'especie':'otro'},'Uso ambiental contra plagas; no especie destinataria de alimentación.','https://www.laboratoriosprovet.com/producto/sinrat-pellets/')
confirmed_species.update(['209:0','340:0'])
cat('160:0 161:0 161:1 161:2','otro',None,'Fincuc se presenta como control de cucarachas; se retira de alimento/medicamento/accesorio.','https://www.aiyellow.com/fincuc/')
change('161:1',{'especie':'otro'},'Producto ambiental; no alimento canino.','https://www.aiyellow.com/fincuc/')
doubt('160:0 161:0 161:1 161:2','subcategoria','Etiqueta/registro y fabricante de cada variante FINCU/FINCUC para distinguir gel, tarro y spray; categoría otro conserva exclusión de alimentos.')
cat('88:20','snack','premio','Delidog Bone aparece en la gama de snacks.','https://www.italcolmascotas.com/chunky-delidog-bone/')
cat('88:16','snack','premio','Delicaprichos Nuggets 160 g es snack canino.','https://www.italcolmascotas.com/chunky-delicaprichos-nuggets/')
cat('89:2 89:3 89:4 89:7 89:8 89:9','snack','premio','Churu es premio complementario; medicado no convierte el vehículo del medicamento en alimento completo.','https://inabafoods.com/ ; https://inabafoods.com/for-cats/')
change('90:0',{'especie':'gato'},'Churu Skin & Coat 14 g es snack felino.','https://inabafoods.com/products/tuna-churu-skin-coat/')
doubt('89:0 89:2 89:3 89:8 89:10','especie','Foto/etiqueta que distinga Cat y Dog, sabor y formato; Churu tiene líneas para ambas especies, no basta la marca o el número de tubos.')
cat('253:0 253:1 253:2','snack','premio','NUPEC Dental/Digestive/Relax Care son premios funcionales.','https://nupec.com/en/nutricion-canina/premios-funcionales')
cat('166:0','suplemento','suplemento','FortiFlora Feline es complemento nutricional probiótico.','https://purina.com.co/proplan/veterinary-diets/gatos/fortiflora')
cat('167:0','suplemento','suplemento','FortiFlora Canine es complemento nutricional probiótico.','https://purina.com.co/proplan/veterinary-diets/perros/probioticos')
change('15:0',{'especie':'perro'},'Apoquel comprimidos: especie canina según fabricante.','https://www.zoetispetcare.com/products/apoquel/tablet')
cat('142:0','higiene','aseo','Epiotic es limpiador auricular para mantenimiento de higiene.','https://co.virbac.com/products/oticos/epiotic')
change('142:0',{'especie':'perro y gato'},'Fabricante declara perros y gatos para Epiotic.','https://co.virbac.com/products/oticos/epiotic')
change('135:0',{'especie':'perro'},'Easotic es producto ótico canino.','https://co.virbac.com/home/productos/perros-y-gatos/oticos-y-oftalmicos/easotic')
change('233:0',{'especie':'gato'},'Milpro 16 mg/40 mg para gatos de más de 2 kg; corresponde al rango local 2–8 kg.','https://cl.virbac.com/products/antiparasitarios-internos/milpro--25-mg25-mg-prueba-1')
cat('233:0 233:1','medicamento','desparasitante','Milpro es antiparasitario interno; no confundir con productos externos.','https://mx.virbac.com/Milpro')
cat('183:0','suplemento','suplemento','Glicopan Pet es suplemento nutricional.','https://homolog.vetnil.com.br/product/glicopan-r-pet')
cat('192:0','suplemento','suplemento','Hemolitan Pet líquido 30/60 ml es suplemento.','https://homolog.vetnil.com.br/product/hemolitan-r-pet')
cat('272:0','suplemento','suplemento','Organew polvo es suplemento de aminoácidos, vitaminas y prebióticos.','https://vetnil.com.br/en/produto/organew-r-en/')
change('289:0',{'especie':'otro'},'Pezosan es ungüento multiespecie; prefijo pez no significa peces. Falta validar presentación 30 mg registrada localmente.','https://www.laboratoriosprovet.com/producto/pezosan-unguento/')
doubt('289:0','especie','Confirmar etiqueta Pezosan de esta referencia: catálogo dice crema 30 mg y fabricante ungüento; no se corrige el peso fuera de alcance.')
change('312:0',{'especie':'otro'},'ReptoMin Tortugas: reptil, no perro. El esquema del agente no enumera reptil; se conserva otro y el nombre explícito.','https://www.tetra-fish.com/reptile/products/nutrition/reptomin-floating-food-sticks')
confirmed_species.add('312:0')
change('359:0 359:1',{'especie':'pez'},'TetraColor es alimento para peces, no perro.','https://www.tetra-fish.com/products/nutrition/tropical-color-flakes')
cat('359:1','comida','concentrado','TetraColor en lata contiene alimento seco; lata no significa comida húmeda.','https://www.tetra-fish.com/products/nutrition/tropical-color-flakes')
change('320:1',{'especie':'gato'},'Royal Fit 32, 400 g: alimento felino.','https://www.royalcanin.com/ie/cats/products/retail-products/fit-32-2520')
change('321:13',{'especie':'gato'},'Royal Canin Persian Adult es felino.','https://www.royalcanin.com/sa/en-sa/cats/products/retail-products/persian-adult-2552')
change('322:0',{'especie':'gato'},'Instinctive 85 g es alimento para gatos adultos.','https://www.royalcanin.com/sg/cats/products/retail-products/instinctive-gravy-4059')
cat('322:0','comida','comida_humeda','Instinctive 85 g: formato húmedo (gravy/jelly/loaf), no seco.','https://www.royalcanin.com/sg/cats/products/retail-products/instinctive-gravy-4059')
cat('60:9 61:2 354:1','comida','comida_humeda','Paté/húmedo explícito en el nombre, no concentrado.')
cat('380:2','comida','comida_humeda','Recovery Feline 100 g: alimento húmedo dietético.','https://www.monge.it/wp-content/uploads/2023/09/Monge-vetsolution-recovery-feline-EN-2.pdf')
cat('380:5','comida','comida_humeda','Recovery Canine 150 g: alimento húmedo dietético.','https://www.monge.it/wp-content/uploads/2019/06/Monge-VetSolution-Recovery-Canine_WET.pdf')
cat('176:0','comida','comida_humeda','Gemon Dog Adult de 150 g pertenece al formato paté/trocitos húmedos.','https://www.monge.it/en/products/filter/%26tax%3Danimale%3A301%3Bbrand-prodotto%3A217/')
change('357:0',{'especie':'gato'},'Temptations corresponde a productos felinos; variante genérica aún requiere identificar snack frente a alimento completo.','https://www.temptationstreats.com/')
doubt('357:0','categoria/subcategoria','Etiqueta y variante de las bolsas 85/180 g: Temptations comercializa snacks y alimento seco; la marca sola no distingue.')
cat('277:0 277:1','higiene','aseo','Oxymed acondicionador/spray es cuidado externo de piel, no alimento.','https://tropiclean.com/collections/oxymed')
change('277:0 277:1',{'especie':'perro y gato'},'Gama de acondicionador 20 oz y spray 8 oz del fabricante para perros y gatos.','https://tropiclean.com/products/tropiclean-oxymed-medicated-anti-itch-spray-for-pets-8oz ; https://tropiclean.com/products/tropiclean-oxymed-medicated-anti-itch-conditioning-treatment-for-pets-1-g')

# Comprobaciones adicionales sobre productos concretos y divergencias remotas.
confirmed_species.update(['104:0','164:0','160:0','161:0','161:1','161:2'])
cat('101:14','accesorio','accesorio','Comedero explícito: corregir también el remoto que lo trataba como snack por la palabra hueso.')
cat('72:0','higiene','aseo','Perfume para gato explícito; no alimento.')
cat('125:2 125:3 127:12 127:13 127:14 127:15 127:16 127:17','comida','concentrado','Alimento seco explícito Diamond Kitten Cat/Dog Chow por línea, nombres fuente y pesos; no medicamento.')
change('125:0 88:27',{'especie':'gato'},'CAT/GATICOS explícito en nombre, también para divergencia remota.')
change('154:0',{'especie':'gato'},'Producto Félix felino, sin extrapolar su formato nutricional.','https://purina.com.co/felix')
cat('88:22 88:23','snack','premio','Delidog Dent y Mix pertenecen a snacks, no a concentrados.','https://www.italcolmascotas.com/chunky-delidog-mix/ ; https://www.italcolmascotas.com/chunky-delidog-dent/')
cat('88:0 88:1 88:21 88:26','comida','comida_humeda','Delicat/Delidog pote, carne y estofado son formatos húmedos.','https://www.italcolmascotas.com/chunky-delidog-estofados/')
cat('89:0 89:1 89:5 89:6 90:0','snack','premio','Churu Bites/Rolls/Skin son premios complementarios; se normaliza subcategoría premio.','https://inabafoods.com/')
cat('113:0','medicamento','antipulgas','Credelio Cat es antiparasitario externo felino, no accesorio. Falta ID remoto de esta referencia.','https://my.elanco.com/us/credelio-cat')
cat('137:0 138:0 138:1','medicamento','desparasitante','Endogard 2.5/10/30 es antiparasitario interno canino.','https://co.virbac.com/products/antiparasitarios-internos/endogard')
change('378:0',{'especie':'perro'},'Vetmedin es medicamento canino según fabricante.','https://www.boehringer-ingelheim.com/sa/salud-animal/productos/vetmedin')
change('173:0',{'especie':'perro'},'Galliprant comprimidos tiene destino canino.','https://www.galliprantfordogs.com/')
change('156:0 156:1',{'especie':'gato'},'Feliway reproduce feromonas felinas; especie documentada.','https://us.feliway.com/products/feliway-classic-spray-60ml')
cat('156:1','otro',None,'Feromona ambiental en spray; no es alimento ni medicamento administrable.','https://us.feliway.com/products/feliway-classic-spray-60ml')
doubt('156:0','categoria/subcategoria','Identificar versión exacta de Feliway 20 ml; no extrapolar formato del spray 60 ml.')
cat('10:0','suplemento','suplemento','Amigo Calcio: suplemento nutricional en tabletas.','https://www.laboratoriosprovet.com/producto/amigo-calcio/')
change('10:0',{'especie':'perro y gato'},'Fabricante declara misma tableta para perros y gatos.','https://www.laboratoriosprovet.com/producto/amigo-calcio/')
cat('10:3','suplemento','suplemento','Amigo Puppy es suplemento nutricional para cachorros caninos.','https://www.laboratoriosprovet.com/producto/amigo-puppy/')
change('75:0',{'especie':'perro y gato'},'Canisan D: fabricante declara perros y gatos.','https://www.laboratoriosprovet.com/producto/canisan-d/')
change('75:1',{'especie':'perro y gato'},'Canisan F no significa exclusivo felino: ficha de fabricante declara perros y gatos.','https://laboratoriosprovet.com/wp-content/uploads/2023/05/Canisan-F.pdf')
cat('75:0 75:1','medicamento','desparasitante','Suspensiones antiparasitarias internas, no alimento.','https://laboratoriosprovet.com/wp-content/uploads/2023/05/Canisan-F.pdf ; https://www.laboratoriosprovet.com/producto/canisan-d/')
cat('69:0','suplemento','suplemento','Calmurofel cápsulas es alimento complementario felino.','https://www.bioiberica.com/en/products/animal-health/calmurofel')
change('69:0',{'especie':'gato'},'Cápsulas Calmurofel formuladas para gatos.','https://www.bioiberica.com/en/products/animal-health/calmurofel')
cat('140:0','suplemento','suplemento','Entero-Chronic es alimento complementario, no medicamento.','https://www.bioiberica.com/en/products/animal-health/companion-animal-health/internal-health')
change('140:0',{'especie':'perro y gato'},'Entero-Chronic sobres: complemento para perros y gatos.','https://www.bioiberica.com/en/products/animal-health/companion-animal-health/internal-health')
change('63:0',{'especie':'perro y gato'},'Brillo Clean Eyes 120 ml para ambas especies.','https://www.laboratoriosprovet.com/producto/brillo-clean-eyes/')
change('21:0',{'especie':'gato'},'Arena Fresh Step es arena sanitaria felina.','https://www.freshstep.com/')
change('341:0 385:0',{'especie':'ave'},'Sinsontes y pichones identifican aves explícitamente; formato/categoría queda pendiente donde falte ficha.')
change('4:2',{'especie':'gato'},'Agility Gold Esterilizados es línea felina explícita del fabricante.','https://www.italcolmascotas.com/agility-gold-cuidado-especial-gatos/')
change('194:16',{'especie':'gato'},'Hairball Control Adult 7+ es alimento felino seco, no canino.','https://www.hillspet.com/cat-food/science-diet-mature-adult-hairball-dry')
cat('4:0','comida','comida_humeda','Agility EN Gato de 140 g corresponde a Entérico gatos en lata con 75% de humedad.','https://www.italcolmascotas.com/agility-gold-enterico-gatos/')
cat('10:4','suplemento','suplemento','Amigo Renal Support se declara suplemento nutricional; se conserva la variante gato local.','https://www.laboratoriosprovet.com/wp-content/uploads/2025/04/AMIGO-RENAL-SUPPORT_DAVID_Ingles.pdf')

# Conflictos detectados cuya etiqueta es imprescindible; ninguna clasificación inventada.
doubt('1:3 4:2 4:10 4:15 59:8 59:9 67:0 78:0 78:1 88:12 88:15 88:19 88:32 120:0 143:6 147:2 153:0 154:0 175:1 182:0 189:0 194:16 207:1 217:0 219:6 220:0 231:0 231:1 231:2 231:3 231:4 231:5 231:6 231:7 231:8 231:9 231:10 236:0 238:0 240:0 259:0 259:1 280:0 287:0 287:2 293:1 295:2 299:24 308:0 320:2 321:0 321:5 321:7 321:16 321:17 321:18 321:19 325:0 328:0 331:0 337:0 341:0 343:0 343:1 344:1 346:0 347:0 354:3 355:4 379:0 380:0 380:3 381:14 381:16 381:17 385:0 390:1','especie/categoria/subcategoria','Identificar fabricante, variante exacta y etiqueta del SKU; nombre abreviado/genérico o presentación insuficiente para resolver todas las clasificaciones con fuente primaria.')
doubt('60:13','categoria/subcategoria','Ficha de BR For Cats Softy Weight 100 g: BR no equivale a Brit; confirmar snack funcional frente a alimento.')
doubt('218:0','especie','LOROS Y HAMSTER agrupa dos destinatarios. Confirmar si el mismo producto está formulado para ambas especies o si mezcla referencias distintas.')
doubt('48:0 159:0 171:0','especie','Conejo es lagomorfo; el agente actual agrupa conejo dentro de roedor. Corregir taxonomía biológica exige decisión de esquema/lógica fuera del alcance autorizado.')
questions.pop('4:2',None)
questions.pop('194:16',None)

# Segunda revisión: decisiones por referencia, con fuente y sin extrapolar dosis.
for item in json.loads((OUT/'second-review-decisions.json').read_text()):
    change(item['keys'],item['patch'],item['reason'],item['source'])
    if item['clear']:
        for key in item['keys'].split(): questions.pop(key,None)

# Tercera revisión sistemática: decisiones verificadas, separadas del registro
# de búsquedas. Un intento de búsqueda por sí solo nunca autoriza un cambio.
for third_path in [OUT/'third-review-decisions.json',OUT/'fourth-review-decisions.json']:
    if not third_path.exists(): continue
    for item in json.loads(third_path.read_text()):
        change(item['keys'],item.get('patch',{}),item['reason'],item['source'])
        for key in item['keys'].split():
            if item.get('clear'): questions.pop(key,None)
            for finding in item.get('protected_data_findings',[]):
                classification_notes[key].append('Dato protegido: '+finding)
            if item.get('documented_other'):
                confirmed_species.add(key)
                classification_notes[key].append(item['reason']+' Fuente: '+item['source'])
            if item.get('pending'):
                for q in item['pending']: doubt(key,q['field'],q['missing'])

# Especie no exclusiva es válida en objetos físicos genéricos. No es evidencia
# de aptitud universal, ni un error que obligue a inventar perro/gato.
for bi,b in enumerate(catalog):
    for ri,r in enumerate(b['referencias']):
        key=f'{bi}:{ri}'
        physical = r['categoria'] in ['accesorio','juguete'] or (r['categoria']=='higiene' and re.search(r'^(cepillo|cortaunas|corta|guante|kit cepillo|tapete|panal)\b',norm(r['nombre'])))
        if r['especie']=='otro' and physical and all(q['field']=='especie' for q in questions[key]):
            questions.pop(key,None)
            confirmed_species.add(key)
            classification_notes[key].append('Campo opcional: objeto físico genérico sin destinatario exclusivo documentado. Otro es válido; no garantiza ajuste anatómico ni compatibilidad universal. Confirmar talla/uso solo cuando una consulta concreta lo requiera.')

# Multiespecie documentada más amplia que perro/gato: conservar otro sin
# perder especies por una reducción arbitraria. No implica duda de producto.
for key,source in {'70:0':'https://co.virbac.com/calsyn','183:0':'https://homolog.vetnil.com.br/product/glicopan-r-pet','192:0':'https://homolog.vetnil.com.br/product/hemolitan-r-pet','272:0':'https://vetnil.com.br/en/produto/organew-r-en/'}.items():
    confirmed_species.add(key)
    classification_notes[key].append('Multiespecie documentada; el campo plano se conserva como otro porque también comprende especies distintas de perro/gato. Fuente: '+source)

# Normalizaciones respaldadas en la estructura local, para diferencias remotas previas.
for bi,b in enumerate(catalog):
    for ri,r in enumerate(b['referencias']):
        key=f'{bi}:{ri}'
        if r['categoria']=='vacuna':
            cat(key,'medicamento','biologico','Vacuna es un biológico veterinario: unificar dentro de medicamento, categoría admitida por filtros existentes.')

def codes(r):
    return sorted({str(c) for p in r['presentaciones'] for c in [p.get('metadata',{}).get('codigo'),*p.get('metadata',{}).get('codigos',[])] if c})

index=collections.defaultdict(list)
for r in remote:
    for p in r['catalog_presentations']:
        for code in set([p.get('metadata',{}).get('codigo'),*p.get('metadata',{}).get('codigos',[])])-{None}:
            index[str(code)].append((r,p))

coverage=[]; local_changes=[]; remote_changes=[]; used=collections.defaultdict(list)
for bi,b in enumerate(catalog):
    for ri,r in enumerate(b['referencias']):
        key=f'{bi}:{ri}'; before=ref(key,original)
        cs=codes(r); matches={x['id']:x for c in cs for x,p in index[c]}
        binding='codigo_unico'
        if key=='4:9':
            # Sin código: igualdad exacta de marca/nombre Y todos los nombres fuente.
            matches={x['id']:x for x in remote if x['catalog_brands']['name']==b['marca'] and x['name']==r['nombre'] and x['metadata'].get('original_names')==r['metadata']['original_names']}
            binding='identidad_exacta_compuesta_sin_cambios'
        target=next(iter(matches.values())) if len(matches)==1 else None
        if target: used[target['id']].append(key)
        local_delta={k:{'before':before[k],'after':r[k],**{a:v for a,v in decisions[key][k].items() if a!='value'}} for k in FIELDS if before[k]!=r[k]}
        if before.get('metadata',{}).get('especies') != r.get('metadata',{}).get('especies'):
            local_delta[SPECIES_LIST]={'before':before.get('metadata',{}).get('especies'),'after':r['metadata']['especies'],**{a:v for a,v in decisions[key][SPECIES_LIST].items() if a!='value'}}
        # 'otro' nunca significa evidencia de aplicabilidad universal.
        if r['especie']=='otro' and key not in confirmed_species and not any('especie' in q['field'] for q in questions[key]):
            doubt(key,'especie','No hay especie de destino explícita: se necesita etiqueta/ficha del fabricante exacto. Se conserva otro; no se asume perro y gato.')
        if not target:
            doubt(key,'sincronizacion','No existe coincidencia uno-a-uno por código comercial en Supabase. No crear, unir ni actualizar otra referencia por nombre.')
        remote_delta={}
        if target:
            # Solo se sincronizan decisiones probadas en esta revisión. Las diferencias
            # preexistentes que no tienen evidencia específica se reportan, no se copian.
            for k,decision in decisions[key].items():
                if k == SPECIES_LIST:
                    metadata=copy.deepcopy(target.get('metadata') or {})
                    metadata['especies']=r['metadata']['especies']
                    if metadata != target.get('metadata'):
                        remote_delta['metadata']={'before':target.get('metadata'),'after':metadata,**{a:v for a,v in decision.items() if a!='value'}}
                    continue
                rk=REMOTE_FIELDS[k]
                if target[rk]!=r[k]:remote_delta[rk]={'before':target[rk],'after':r[k],**{a:v for a,v in decision.items() if a!='value'}}
            unresolved={k:{'local':r[k],'remote':target[rk]} for k,rk in REMOTE_FIELDS.items() if k not in decisions[key] and r[k]!=target[rk]}
            if unresolved:
                doubt(key,'divergencia_supabase','Diferencia preexistente sin evidencia suficiente para sobrescribir: '+json.dumps(unresolved,ensure_ascii=False))
        item={'local_key':key,'brand':b['marca'],'name':r['nombre'],'codes':cs,'remote_id':target['id'] if target else None,
              'binding':binding if target else 'sin_correspondencia','presentations':len(r['presentaciones']),
              'classification_before':{k:before[k] for k in FIELDS},'classification_after':{k:r[k] for k in FIELDS},
              'review':'corregido_con_pendientes' if local_delta and questions[key] else 'corregido' if local_delta else 'pendiente' if questions[key] else 'sin_inconsistencia_detectada',
              'local_delta':local_delta,'remote_delta':remote_delta,'pending':questions[key]}
        item['classification_notes']=classification_notes[key]
        item['declared_species_before']=before.get('metadata',{}).get('especies')
        item['declared_species_after']=r.get('metadata',{}).get('especies')
        item['evidence_decisions']=decisions[key]
        for q in item['pending']:
            weights=', '.join(p['peso'] for p in r['presentaciones'])
            if q['field']=='sincronizacion':
                q['cause']='identidad_remota_ausente'
                q['question']=f'¿Qué UUID de Distrifinca corresponde al código {", ".join(cs)} de {r["nombre"]} ({weights})? Confirmar si no está importado; no se usará otro por parecido.'
            elif q['field']=='divergencia_supabase':
                q['cause']='divergencia_local_remota'
                q['question']='¿Cuál valor corresponde a la etiqueta actual de este SKU? '+q['missing']
            elif key in ['48:0','159:0','171:0']:
                q['cause']='limite_taxonomia'
                q['question']='El destino conejo ya es conocido. ¿Se mantiene temporalmente el agrupamiento comercial roedor o se agenda por separado soporte de lagomorfo? No falta evidencia de especie.'
            elif q['field']=='especie' and r['especie']=='otro':
                q['cause']='destino_no_documentado'
                q['question']=f'Para {r["nombre"]}, presentación {weights}, ¿cuál es el fabricante y qué especies aparecen en la etiqueta/registro? No se detectó contradicción: falta dato para filtrar con seguridad.'
            else:
                q['cause']='variante_o_clasificacion_ambigua'
                q['question']=f'Confirmar nombre completo/EAN de {r["nombre"]} ({weights}) y el campo {q["field"]}. Clasificación actual: {r["especie"]}/{r["categoria"]}/{r["subcategoria"]}. '+q['missing']
        if item['pending'] and key in manual_decisions:
            item['manual_disposition']=manual_decisions[key]
            for q in item['pending']:
                if q['field']!='sincronizacion':
                    q['question']=manual_decisions[key]['required']
                    q['missing']=manual_decisions[key]['reason']
        if target:
            item['remote_identity']={'name':target['name'],'brand':target['catalog_brands']['name'],'active':target['active']}
            item['preexisting_remote_differences']={k:{'local':before[k],'remote':target[rk]} for k,rk in REMOTE_FIELDS.items() if before[k]!=target[rk]}
        coverage.append(item)
        if local_delta:local_changes.append(item)
        if remote_delta:remote_changes.append(item)
assert all(len(v)==1 for v in used.values()),'No se admite vínculo muchos-a-uno'
assert len({p['remote_id'] for p in remote_changes})==len(remote_changes)

# Solo cuatro campos planos y la lista de especies ya soportada por el agente.
# Todo el resto de metadata (aliases, códigos, reglas comerciales...) permanece protegido.
protected_before=copy.deepcopy(original); protected_after=copy.deepcopy(catalog)
for x in (protected_before,protected_after):
    for b in x:
        for r in b['referencias']:
            for k in FIELDS:r.pop(k,None)
            r.get('metadata',{}).pop('especies',None)
assert protected_before==protected_after,'Modificación no autorizada'
allowed_species={'perro','gato','perro y gato','ave','roedor','pez','equino','bovino','otro'}
allowed_categories={'comida','snack','medicamento','accesorio','higiene','suplemento','arena_sustrato','juguete','otro'}
assert all(r['especie'] in allowed_species and r['categoria'] in allowed_categories for b in catalog for r in b['referencias'])
summary={'local_brands':len(catalog),'local_references':len(coverage),'local_presentations':sum(x['presentations'] for x in coverage),
         'remote_references':len(remote),'remote_presentations':sum(len(r['catalog_presentations']) for r in remote),
         'local_changed_references':len(local_changes),'local_changed_fields':sum(len(x['local_delta']) for x in local_changes),
         'remote_planned_references':len(remote_changes),'remote_planned_fields':sum(len(x['remote_delta']) for x in remote_changes),
         'pending_references':sum(bool(x['pending']) for x in coverage),'pending_questions':sum(len(x['pending']) for x in coverage),
         'bound_references':len(used),'protected_fields_unchanged':True,'supabase_applied':False,
         'references_with_optional_or_taxonomy_notes':sum(bool(x['classification_notes']) for x in coverage),
         'references_with_external_evidence':sum(any(d['source'].startswith('http') for d in x['evidence_decisions'].values()) for x in coverage),
         'pending_by_cause':dict(collections.Counter(q['cause'] for x in coverage for q in x['pending'])),
         'before_sha256':hashlib.sha256(raw).hexdigest(),
         'local_field_changes':dict(collections.Counter(k for x in local_changes for k in x['local_delta']))}
def write(name,value): (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
write('coverage.json',coverage);write('local-changes.json',local_changes);write('remote-plan.json',remote_changes)
write('pending.json',[x for x in coverage if x['pending']]);write('summary.json',summary)
write('remote-unmatched.json',[r for r in remote if r['id'] not in used])
candidate=json.dumps(catalog,ensure_ascii=False,indent=2)+'\n'
(OUT/'productos.candidate.json').write_text(candidate)
if '--apply-local' in sys.argv:
    actual=(ROOT/'productos.json').read_bytes()
    if actual not in (raw,candidate.encode(),previous_candidate):raise RuntimeError('Cambio concurrente local: no sobrescribir')
    (ROOT/'productos.json').write_text(candidate)
print(json.dumps(summary,ensure_ascii=False,indent=2))
