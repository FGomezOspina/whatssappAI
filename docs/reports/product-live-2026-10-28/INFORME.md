# Validación real y correcciones de identificación de productos

Trabajo local iniciado el 28 de octubre y continuado el 29 de octubre de 2026 (UTC). **Corrección implementada y validación real completada en el Sandbox propio del usuario.**

## Fe de erratas — 29 de octubre de 2026 (UTC)

La auditoría de procedencia corrige el origen y la descripción del corpus: los 1.885 mensajes provienen de una exportación de **Kapso Sandbox**, no de Supabase ni de `training_examples`. Son 24 registros de conversación asociados a cinco contactos distintos; no equivalen a 24 clientes y no se verificó la identidad de los cinco contactos. Las 517 entradas entrantes distintas por conversación incluían marcadores multimedia: 483 corresponden a entradas de mensajes originales de tipo texto. Los 56 registros de `training_examples` se inspeccionaron por separado como ejemplos para el agente y no se contaron como historial ni como los 30 fragmentos de evaluación.

Se corrigieron las secciones de corpus y sus etiquetas. Se conserva la evidencia de las pruebas E2E, sus resultados y limitaciones; esta rectificación documental no ejecutó nuevas pruebas, envíos, llamadas a IA ni reinicios. La trazabilidad comprobada y la limitación de la invocación inicial no conservada se detallan en el anexo. Esta versión reemplaza el mismo archivo de Library, `libfile_eb819aa887988191800d56f74f8cc1fe`, sin crear una copia independiente.

## Evidencia y causas

Se verificaron Safari/WhatsApp Web, el contacto Kapso Sandbox, el canal configurado, el túnel ngrok, el proceso que escuchaba en 3000, el historial persistido y las respuestas reales del proveedor. No se enviaron pruebas a clientes reales.

La secuencia del usuario de 22:43–22:44 UTC está guardada en `before.json`. La pregunta por Pro Plan UR recibió aclaración de especie; «para perrito» recibió derivación comercial. La entrega del webhook obtuvo HTTP 200. El proceso 90471 se había iniciado a las 16:50:27 locales y era anterior a las modificaciones previas: tener el código actualizado en disco no implicaba que ese proceso lo hubiera cargado.

Había tres rutas automáticas `producto_no_resuelto` que convertían una identidad pendiente en derivación. Una derivación pendiente comercial detenía turnos posteriores. Se eliminaron esas derivaciones automáticas: la incertidumbre comercial ahora conserva contexto, solicita atributos útiles o reconoce que no puede confirmar una referencia. Las peticiones explícitas de humano y la atención humana activa siguen respetándose. Una derivación clínica pendiente permite consultas comerciales sin cerrarla.

La primera prueba después del reinicio encontró un fallo adicional real: el router entendió «el concentrado» como aclaración pero devolvió referencia null. La continuación exigía un atributo estructurado y perdía la identidad acumulada. La búsqueda resultante omitía UR y especie; el validador textual podía aceptar CAT URINARY. Se amplió la continuación semántica para conservar identidad y especie conocidas y usar la descripción actual como evidencia adicional, sin inventar una referencia. El caso capturado se añadió a los tests.

Otra repetición del mensaje inicial fue interpretada como clínica pese a pedir precio. Se reforzó en el mismo router la separación entre relato médico y acción solicitada: precio de una referencia mencionada por el cliente es información comercial, incluso si fue recomendada por otra persona. No se añadieron clasificadores por listas de palabras ni se cambió el modelo.

La prueba de Agility descubrió que seleccionar «el de 3 kilos, solo dime su precio» mantenía `intencionPresentaciones=todas` y una selección histórica de alternativas. Se limpia esa selección cuando una aclaración aporta un peso explícito, aunque esté dentro de una frase. No se modifican los precios ni las presentaciones del catálogo.

La prueba de dos mensajes consecutivos mostró además una divergencia entre contexto semántico y consulta léxica: el router conservó Diamond Indoor Cat, pero la búsqueda tomó la aclaración de peso como una solicitud aislada. `continuarConsultaDeLote` usa únicamente textos del mismo lote pendiente para respaldar marca/referencia y construir la consulta completa; no reejecuta eventos ni mutaciones. La repetición real recibió el segundo mensaje mientras el primero se procesaba, descartó el borrador obsoleto y envió una sola cotización correcta. El buffer y el coordinador no se modificaron para esta corrección.

## Componentes

- `conversationService.js`: continuidad semántica de aclaraciones descriptivas, selección de presentación específica y retirada de derivaciones comerciales automáticas.
- `humanHandoffService.js`: política clínica/solicitud humana, recuperación de pausas comerciales heredadas, preservación del operador activo.
- `aiContextOptimizer.js`: criterio general de intención comercial frente a petición clínica actual, sin ejemplos de marcas.
- `server.js`: huella de fuentes al arrancar para verificar código realmente cargado.
- `productRecognitionTrace.js`: seguimiento y decisión de derivación en la traza optativa.
- `test/productRecoveryContext.test.js`, `test/contextualHandoff.test.js`, `test/server.test.js`: regresiones y comprobaciones de la política, contexto y arranque.

Se conservaron las mejoras anteriores en recuperación progresiva, `productRequestContext.js`, `catalogRecoveryPlan.js`, `catalogContextService.js` y repositorio de productos; véase `../product-context-2026-10-28/INFORME.md`. Los cambios de checkout ya existentes pertenecen al encargo anterior y no se reescribieron para esta corrección.

## Historial y catálogo

Se reutilizó una exportación de Kapso Sandbox con 24 registros de conversación y 1.885 mensajes únicos: 1.038 entrantes y 847 salientes. Los registros corresponden a cinco contactos distintos, cuya identidad no se verificó; no deben describirse como 24 clientes ni atribuir todos sus mensajes al usuario. La revisión previa contabilizó 517 entradas entrantes distintas tras deduplicar dentro de cada conversación, incluyendo marcadores multimedia; 483 son entradas textuales distintas de mensajes originales de tipo texto. Se contrastaron además 48 respuestas de los extremos de los chats y la muestra etiquetada previa de 30 fragmentos. Las transcripciones disponibles se aprovecharon; no se volvió a descargar ni interpretar todo el audio e imágenes. Este corpus de Sandbox no se presenta como una muestra independiente de ventas reales.

Supabase aportó el catálogo para contrastar identidades y una inspección separada del estado del agente. El snapshot de 2026-10-28T14:53:58.347Z registró 5 filas en `whatsapp_messages`, 1 en `whatsapp_conversations` y 56 en `training_examples`. Estos últimos se inspeccionaron como ejemplos del agente; no fueron la fuente de los 1.885 mensajes ni se sumaron a los 30 fragmentos.

Patrones revisados: referencias abreviadas, formatos secos/húmedos, especies expresadas coloquialmente, nombres con errores, pesos y tamaños en varios turnos, correcciones de sabor, consultas intermedias con carrito, referencias similares, recomendaciones recibidas frente a peticiones de tratamiento. Se excluyeron saludos, dirección/pago y medios sin transcripción de las métricas de identificación. Las respuestas antiguas no se tomaron como verdad de precio o stock.

`catalog-verified.json` contiene la lectura actual de Supabase para las familias probadas, con IDs, especie, peso, precio y stock. Stock null significa desconocido: no prueba disponibilidad. No se editaron catálogo, funciones SQL, índices ni esquema. Los writes normales del agente durante las pruebas son mensajes, estado conversacional y capturas de aprendizaje pendientes/inactivas; no se aprobaron equivalencias ni aprendizaje automáticamente.

## Recuperación y precisión

Se conserva Router → búsqueda FTS y recuperación limitada → candidatos → validador → motor. La solicitud estructurada mantiene desconocidos como null; el contexto vigente combina únicamente aclaraciones compatibles y expira. Una nueva solicitud cambia el foco sin alterar el carrito. La recuperación elimina consultas repetidas y tiene límites de intentos/tiempo; la identidad comercial prima sobre la semejanza de palabras. Las variantes de especie, formato y unidades ayudan a recuperar y validar, no autorizan elegir otra marca o línea.

No se añadieron embeddings: el benchmark previo no demostró una necesidad que justificara otro servicio y latencia. Tampoco se comparó contra un modelo vectorial, por lo que no se afirma superioridad universal. La mejora semántica real del modelo se evalúa aquí por respuestas del Sandbox; los fixtures deterministas no demuestran generalización universal.

## Resultados reales antes y después

Todos los tiempos de esta tabla son UTC. Los mensajes de 00:xx corresponden al 29 de octubre. `live-messages.json` conserva ID, hora, texto, sentido y estado de Kapso. `product-traces.json` conserva el recorrido router/candidatos/validador por run. Las referencias observadas se contrastaron por nombre, especie, presentación y precio contra los IDs de `catalog-verified.json`; el motor no expone un ID SQL de referencia en su respuesta al usuario.

| Caso | Resultado antes de la corrección relevante | Resultado verificado después |
|---|---|---|
| Pro Plan UR → para perrito | 22:44:22: derivación comercial del incidente original | 00:22:49: conserva UR y perro; distingue CANINE UR 2 kg de CANINE LATA UR, sin derivar |
| Aclaración «el concentrado» | 00:03:31: cotizó CAT URINARY / GATO URINARY, incorrecto | 00:09:30 y nuevamente 00:23:49: CANINE UR 2 kg, $122.000; ID esperado 900230bf-4cf5-4522-afb6-739f0275909f |
| Precio de producto recomendado con relato clínico | 00:06:12: interpretación clínica incorrecta | 00:07:57 y 00:22:04: inicia identificación comercial; la última repetición ocurre con una consulta clínica pendiente |
| «royal canon gastrointestinal para perro de 2kg» | Control de otra marca y error ortográfico, sin ensayo anterior comparable | 00:10:17: ROYALCANIN GASTROINTESTINAL PERRO 2 kg, $129.000; ID 2765c462-c1bf-43cf-babc-0750dd39caa0 |
| Agility gold cachorros → perro raza grande → 3 kilos | Identificó GRAND CACH pero a las 00:12:26 seguía listando 1,5 / 3 / 15 kg | 00:13:42: solo AGILITY GRAND CACH 3 kg, $65.400; ID 4128b96d-b89a-4189-a9f3-cac359cd35e4 |
| Diamond Indoor Cat → 500 gramos mientras procesa | 00:15:26: falsa ausencia de «SOLO»; se perdió identidad en la consulta léxica | 00:18:36: una respuesta de DIAMOND INDOOR CAT 500 g, $19.500; ID 1224f0d0-b4db-494b-8200-56c6e0dad19f |
| Marca/ref de control inexistente | No se usa como referencia de producción | 00:19:32: ausencia, sin sustitución. A las 00:20:24, al no aportar más datos, reconoce incertidumbre sin derivación comercial |
| Tratamiento y dosis por síntomas | Control clínico deliberado | 00:21:15: deriva a criterio veterinario sin prescribir; el siguiente mensaje comercial sí se atiende |

Son cuatro identidades comerciales reales verificadas, con múltiples turnos y presentaciones, y controles de ausencia/criterio clínico. Las cuatro terminan correctamente después de sus correcciones. No es una estimación estadística de precisión sobre todo el catálogo: las pruebas se seleccionaron para explorar fallos y se conservaron también las respuestas incorrectas intermedias.

La repetición final completa del caso original se hizo **después del último reinicio**, con el proceso definitivo: 00:21:32 consulta inicial → 00:22:04 especie → 00:22:16 «para perrito» → 00:22:49 seco/lata → 00:23:18 «el concentrado» → 00:23:49 precio correcto. Los controles Royal y Agility corresponden a versiones intermedias que ya contenían sus respectivas correcciones; el cambio final se limita a consultas con contenido pendiente de la misma ráfaga, y la suite completa se volvió a ejecutar sobre esa versión final.

## Concurrencia, entrega y persistencia

- 22 mensajes entrantes de prueba y 20 respuestas salientes de Kapso, todos los salientes con estado `sent` y comprobación visual de las respuestas relevantes en WhatsApp Web.
- 22 entregas HTTP del túnel correspondientes a esos entrantes: todas `200 OK`.
- Las dos parejas de mensajes durante procesamiento producen una respuesta por pareja: dos borradores obsoletos se descartaron. La primera pareja descubrió la pérdida semántica; la segunda conserva identidad y peso. No hay mensajes de prueba pendientes sin respuesta al finalizar.
- Reentrega del mismo webhook firmado: HTTP 200 sin segunda respuesta. Repetida tras reiniciar: `already_processed`, sin llamadas nuevas a OpenAI ni búsqueda de catálogo ni envío de WhatsApp. Evidencias `replay.json`, `replay-after-restart.json` y `performance.json`.
- Supabase: 22 entradas, 20 salidas, cero claves de evento duplicadas (`persistence-check.json`).
- Carrito idéntico al inicio: un BR CAT SALMON de 1 kg y una ARENA KITTEN LAVANDA de 8 kg, total $54.300. Cero pedidos creados durante las pruebas (`order-check.json`).
- Cero excepciones de procesamiento en los runs de esta sesión. El problema comprobado era de política/contexto/identificación y código no cargado, no de recepción de Kapso ni una excepción de Supabase en esos turnos.

Los tests automatizados cubren además fallos simulados de OpenAI, Supabase y Kapso, liberación de locks, mensajes en espera, reentregas, aislamiento de tenant, persistencia, carrito/checkout y rutas de audio/imagen. No se interrumpieron servicios reales para provocar fallos. No se promete entrega exactamente una vez ante una aceptación remota incierta: el sistema evita reenvíos ciegos, pero esa situación requiere reconciliar con el proveedor. No se ha añadido una cola durable nueva ni reconstruido el buffer.

## Métricas y latencia

**Suite final: 998 pruebas, 998 pasan, 0 fallos.** Archivo `tests-final.txt`. `git diff --check` también pasa.

Benchmark determinista de catálogo, sobre el mismo conjunto de 206 casos (97 referencias reales × 2 + 12 continuaciones):

| Métrica | Base anterior | Código final |
|---|---:|---:|
| Candidato objetivo recuperado | 199/206 | 206/206 |
| Selecciones finales correctas | 186 | 188 |
| Selecciones finales incorrectas | 0 | 0 |
| Aclaraciones necesarias | 11 | 16 |
| Continuaciones conservadas | 5/12 | 12/12 |

Los resultados finales se recalcularon en `benchmark-final.json`: p50 local 39,62 ms, p95 74,23 ms. Esto mide recuperación/validación local con snapshot y decisiones semánticas preparadas, **no latencia de WhatsApp/OpenAI ni generalización del modelo**. Los dos casos restantes sin selección ni aclaración no se ocultan dentro de las 188 selecciones. La base y el diseño están documentados en el informe anterior de product-context.

Medición real de toda esta sesión, incluidos intentos de diagnóstico fallidos semánticamente y sus repeticiones (20 respuestas):

| Intervalo medido | p50 | p95 | Máximo |
|---|---:|---:|---:|
| Servidor, incluido buffer/cola | 25,48 s | 37,36 s | 39,85 s |
| Timestamp entrante Kapso → saliente Kapso | 31 s | 44 s | 46 s |

La última secuencia UR tuvo 26,85 / 27,02 / 26,04 s dentro del servidor. Sus búsquedas fueron 573 / 791 / 643 ms; OpenAI acumuló 16,64 / 16,29 / 15,49 s. El buffer sigue en aproximadamente 5 s. La prueba concurrente pasó de una respuesta incorrecta en 39,85 s a una correcta en 37,36 s; recuperación 2.884 → 442 ms. Son observaciones de runs diferentes, no una estimación causal controlada de mejora de velocidad.

El incidente previo «para perrito» tardó aproximadamente 28 s hasta la derivación; la última respuesta correcta de aclaración tardó 33 s según Kapso. **No se afirma una aceleración global**: se corrigió el resultado y se mantuvo el orden de latencia, dominado por las llamadas existentes al modelo y el buffer. En total se hicieron 70 llamadas reales a los modelos configurados, incluyendo routing, mapeo, humanización y memoria, dentro de las pruebas autorizadas. No se cambió ningún modelo ni se añadió otro clasificador o servicio semántico.

## Estado final y límites

Servidor en ejecución: PID **96737**, iniciado 2026-10-29 00:17:39 UTC; `/health` responde ok. Huella de fuentes cargada y en disco coinciden: `4fe0d67186c7de7a1f172b0589b1ec48d3da9bbcc762824d422f149c2e1f7c20`. Se reinició exclusivamente el servidor identificado al cargar cada corrección; ngrok se conservó. Detalles en `restart*.json`, `health.json` y `final-verification.json`.

No se modificaron credenciales, configuración de modelos, precios, inventario, SQL ni esquema. No hubo push, publicación o despliegue remoto. Los cambios son locales y el servidor local los tiene cargados. Se conservaron los cambios previos del usuario/proyecto. No se borró historial ni se reinició la conversación. El Sandbox conserva la derivación clínica de la prueba; la atención comercial continúa funcionando.

No hubo bloqueos de autorización pendientes. La validación real de esta sesión fue textual; audio e imágenes tienen cobertura automatizada y corpus previo, pero no una nueva prueba end-to-end multimedia en esta sesión. La corrección evita los fallos reproducidos y amplía la cobertura general; no garantiza resolver cualquier referencia imaginable ni respuestas infalibles de un modelo probabilístico. La falta de stock explícito en Supabase impide certificar existencias mediante estos ensayos de precio.

## Anexo de trazabilidad ampliada

### Corpus previo frente a validación nueva

Los 24 registros de conversación / 1.885 mensajes se recuperaron previamente de Kapso Sandbox. Esta sesión reutilizó ese corpus y sus 30 fragmentos etiquetados con IDs y hash. No son 24 conversaciones nuevas ni 1.885 mensajes reevaluados con el modelo. La revisión deduplicó dentro de cada chat: 517 entradas entrantes distintas, que incluyen marcadores multimedia, de las cuales 483 son entradas textuales de mensajes originales de tipo texto; además se contrastaron 48 respuestas de extremos. Los cinco contactos distintos del corpus no tienen una identidad personal verificada en esta auditoría. Se sumaron 22 mensajes entrantes nuevos y 20 respuestas reales en el Sandbox autorizado para reproducir y verificar los cambios. Los nuevos ensayos son separados de los 30 fragmentos históricos y del benchmark offline de 206 casos. El registro previo informa 34 páginas, cifra compatible con los tamaños exportados y un límite de 100 mensajes; no se conserva una traza íntegra de todas las llamadas HTTP para auditar independientemente ese número.

| Chat | Mensajes | Entrantes / salientes | Casos contrastados | Observación |
|---|---:|---:|---|---|
| C01 | 46 | 28 / 18 | C01-M1-3, C01-M1-4, C01-M1-5 | Lista mixta de alimento, arena y sobres; marca compartida no demuestra especie ni formato. |
| C02 | 47 | 31 / 16 | — | Predominio de imágenes y turnos cortos; conservar contexto visual, sin etiquetar OCR nuevo. |
| C03 | 68 | 49 / 19 | — | Imágenes y solicitudes breves; varias respuestas de no coincidencia requieren identidad contextual. |
| C04 | 435 | 267 / 168 | C04-M1-6, C04-M12-7, C04-M24-8, C04-M85-9, C04-M85-10, C04-M85-11, C04-M85-12, C04-M205-13, C04-M203-14 | Mayor diversidad textual: abreviaturas, húmedos, listas, medicamentos y presentaciones comerciales. |
| C05 | 46 | 25 / 21 | C05-M15-15, C05-M18-16, C05-M29-17, C05-M32-18 | Color coloquial, variantes adulto mayor y código de dieta sin barra. |
| C06 | 3 | 2 / 1 | — | Conversación breve; no aporta una equivalencia independiente para aprender. |
| C07 | 146 | 80 / 66 | C07-M9-0 | Nombre fonético Cat Show y palabras distintivas de línea; repeticiones de cotización. |
| C08 | 59 | 30 / 29 | C08-M25-19 | Agility escrito gol y atributos de edad/tamaño en distinto orden. |
| C09 | 142 | 71 / 71 | C09-M129-20, C09-M131-21, C09-M123-22 | Aromas, marcas cortas y solicitudes corteses de agregar; distinguir identidad de operación. |
| C10 | 77 | 40 / 37 | C10-M3-23 | Presentación y sabor; cortesías y emoji no cambian la identidad. |
| C11 | 2 | 1 / 1 | — | Intercambio de imagen; no hay solicitud textual etiquetable en la muestra. |
| C12 | 26 | 14 / 12 | — | Seguimiento breve con aclaraciones; preservar la pregunta anterior. |
| C13 | 14 | 7 / 7 | — | Imágenes sucesivas y continuidad; no contabilizado como evaluación visual nueva. |
| C14 | 93 | 47 / 46 | C14-M37-24 | Formato húmedo y familia EN ambigua entre lata y alimento seco. |
| C15 | 6 | 3 / 3 | — | Imagen y aclaración; evidencia insuficiente para equivalencia revisada. |
| C16 | 41 | 21 / 20 | — | Solicitudes y seguimientos repetidos; no tratar repetición como confirmación verdadera. |
| C17 | 7 | 4 / 3 | C17-M6-25 | Orden libre de cachorro y tamaño; consulta comercial identificable. |
| C18 | 83 | 39 / 44 | C18-M4-26, C18-M23-27 | Marca/variante no verificable, abreviaturas BR y especie/condición comercial. |
| C19 | 7 | 5 / 2 | — | Conversación breve sin caso independiente de identidad para benchmark. |
| C20 | 32 | 14 / 18 | C20-M14-28 | Imágenes y Ringo croquetas; kilos abreviados kl. |
| C21 | 17 | 8 / 9 | C21-M7-1 | Marca separada en palabras: Fofi cat tofu. |
| C22 | 464 | 239 / 225 | C22-M20-2 | Secuencias largas con imágenes/audio y A/C raza pequeña; etapa no debe cambiar a cachorro. |
| C23 | 2 | 1 / 1 | — | Intercambio mínimo sin producto independiente etiquetado. |
| C24 | 22 | 12 / 10 | C24-M4-29 | Dog Chow A R pequeña, presentación solicitada sin respaldo suficiente. |


Entradas entrantes distintas revisadas por registro de conversación, incluidos marcadores multimedia (total 517; esta lista no cuenta exclusivamente mensajes de texto): C01=13, C02=10, C03=18, C04=98, C05=23, C06=1, C07=45, C08=24, C09=43, C10=14, C11=1, C12=14, C13=2, C14=24, C15=3, C16=19, C17=4, C18=16, C19=1, C20=7, C21=5, C22=125, C23=1, C24=6.

### Procedencia auditada del corpus y separación de fuentes

La comprobación documental del 29 de octubre de 2026 siguió los archivos originales, sin volver a consultar servicios ni modificar sus datos:

1. `/tmp/veltia-read-chats.cjs` recupera mensajes mediante `GET /platform/v1/whatsapp/messages`, con `phone_number_id`, `conversation_id`, `limit=100` y paginación mediante el cursor `after`. Lee el listado de `/tmp/veltia-conversations-private.json` y guarda los mensajes en `/tmp/veltia-messages-private.json`.
2. La exportación de mensajes contiene 24 grupos y 1.885 IDs únicos; todos sus grupos corresponden a IDs del listado de conversaciones. El inventario `/tmp/veltia-phone-inventory-private.json` identifica su canal como `kind: "sandbox"`. Esto prueba la procedencia del canal, no la identidad de sus cinco contactos.
3. `/tmp/veltia-analyze.cjs` lee esa exportación de Kapso y crea `/tmp/veltia-chats-redacted.json`, con identificadores C01–C24 y hashes SHA-256 de los IDs originales. Se comprobaron los 1.885 hashes: cero discrepancias. El texto renderizado puede incluir transcripción disponible de audio o marcadores como `[image]`; por eso 517 entradas distintas no equivale a 517 mensajes textuales distintos.
4. `/tmp/veltia-build-fixtures.cjs` toma fragmentos de la copia anonimizada. Los 30 casos de `test/fixtures/recognition-real-2026-10-28.json` coinciden con el hash y un fragmento literal de un mensaje entrante original de tipo texto. La expectativa comercial se contrastó con el catálogo de Supabase, sin asumir que una respuesta histórica humana o del bot fuera correcta.
5. `/tmp/veltia-supabase-audit.cjs` mantiene separados `messages`, `conversations` y `examples`. Resuelve el tenant mediante `aivance_clients` y consulta `catalog_brands`, `catalog_references`, `catalog_presentations`, `whatsapp_messages`, `whatsapp_conversations` y `training_examples`. El snapshot de `../recognition-2026-10-28/supabase-coverage.json`, fechado 2026-10-28T14:53:58.347Z, contabiliza respectivamente 394 marcas, 1.127 referencias, 1.423 presentaciones, 5 mensajes, 1 conversación y 56 ejemplos. Los ejemplos no se incorporaron como conversaciones ni como fragmentos históricos de evaluación.

**Límite de trazabilidad:** se conserva el listado inicial con estructura de respuesta de API y sus 24 IDs, pero no se encontró la invocación exacta que creó `/tmp/veltia-conversations-private.json`. No se afirman parámetros históricos de esa llamada ni una traza HTTP completa a partir del script posterior de descarga de mensajes.

La [captura del archivo original de exportación](https://chatgpt.com/api/library/files/libfile_9651277d8fb88191b6174adb92347fe5/download) se tomó el 29 de octubre en TextEdit. Es una captura actual del script conservado, no una captura histórica ni del panel de Kapso; no muestra claves ni contactos. Los archivos originales privados se conservaron localmente y no se adjuntaron a Library.

### Treinta fragmentos históricos contrastados

Esta tabla conserva la expectativa de la muestra previamente contrastada con Supabase. No presenta todas estas filas como pruebas nuevas end-to-end ni utiliza las respuestas antiguas del bot/humanos como verdad. Los IDs de evidencia por referencia/presentación están en el fixture original; los casos ambiguos, conflictos y pesos sin respaldo no se convierten en selecciones forzadas.

| Caso chat-mensaje | Solicitud textual | Referencia esperada / estado | Evidencia de catálogo (referencias) |
|---|---|---|---|
| C07-M9-0 | cat show delimix adultos de 10 kg | CAT CHOW DELIMIX | CAT CHOW DELIMIX |
| C21-M7-1 | Fofi cat tofu | ARENA FOFICAT TOFU | ARENA FOFICAT TOFU |
| C22-M20-2 | dog chow a raza pequeña 2kl | presentation_unverified | DOG CHOW POUCHE CARNE; DOG CHOW POUCH PAG; DOG CHOW ADULRMG; DOG CHOW C RMG *; DOG CHOW A.R.P A GRANEL; DOG CHOW C RP; DOG CHOW C RMG; DOG CHOW ADUL TODOS LOS TAMAÑOS 475; DOG CHOW C RMG *475; DOG CHOW SINCO LONGEVIDAD; DOG CHOW POUCHE CACH; DOG CHOW CONTROL DE PESO; DOG CHOW CONTROL PESO SINCOL; DOG CHOW; DOG CHOW A RMG; DOG CHOW A.M.G A GRANEL; DOG CHOW ADUL RMG PAG 19.7 LLEV; DOG CHOW ADUL TODOS LOS TAMAÑOS |
| C01-M1-3 | 10kg de arena de maíz | ARENA MAIZ CAT | ARENA MAIZ CAT |
| C01-M1-4 | un kilo de Cat show reempacado | ambiguous | CAT CHOW GATITOS *; CAT CHOW CARNE; CAT CHOW PESCADO; CAT CHOW A GRANEL; CAT CHOW GATITOS; CAT CHOW DELIMIX; CAT CHOW ESTERELIZADO; CAT CHOW DELICARNE; CAT CHOW VIDA SANA; CAT CHOW VIDA SANA 1.3 PAG; CAT CHOW ESTERILIZADOS |
| C01-M1-5 | cuatro sobres de comida siete vidas para gatos | catalog_conflict | SIETE VIDAS |
| C04-M1-6 | Una bolsa de 3 kilos de Br for Cats bola de pelos | BR CAT ADUL BOLA PELO | BR CAT ADUL BOLA PELO |
| C04-M12-7 | Chuncky salmón y cordero gatos 8 kg | CHUNKY GATOS SALMON CORDERO | CHUNKY GATOS SALMON CORDERO |
| C04-M24-8 | cutamycon x50ml | CUTAMYCON SPRAY | CUTAMYCON SPRAY |
| C04-M85-9 | 1 kg Excellent Urinary gatos | EXCELLENT GATO URINARY | EXCELLENT GATO URINARY |
| C04-M85-10 | 3 latas de Vet Solution Urinary | VETSOLUTION CAT URINARY | VETSOLUTION CAT URINARY |
| C04-M85-11 | 1 lata de Vet Solution Gastro gatos | VETSOLUTION CAT GASTROINTES | VETSOLUTION CAT GASTROINTES |
| C04-M85-12 | 1 Arena x 8 kg Kitten talco | ARENA KITTEN TALCO | ARENA KITTEN TALCO |
| C04-M205-13 | Y tienes comida húmeda Purina pro plan para gatos adultos ? | PRO PLAN POUCH FELINO ADULT | PRO PLAN POUCH FELINO ADULT |
| C04-M203-14 | Tiene díamond naturals indoor cat de libra ? | DIAMOND INDOOR CAT | DIAMOND INDOOR CAT |
| C05-M15-15 | Hola necesito un Ringo del rojo | ambiguous | RINGO CACHORRO; RINGO ADUL; RINGO PREMIUM CACHO; RINGO CREMA DE MANI; RINGO CROQUETAS; RINGO VITALITY ADUL; RINGO PREMIUN PRO; RINGO CROQUETA; RINGO PREMIUM; RINGO PREMIUM CACHORRO; RINGO VITALITY ADULTO; MIRRINGO +PRO; MIRRINGO GATITO; MIRRINGO + PRO; MIRRINGO |
| C05-M18-16 | Ringo croquetas | RINGO CROQUETAS | RINGO CROQUETAS |
| C05-M29-17 | Maneja hills lata ad | HILLS CAN Y FEL LATA A/D | HILLS CAN Y FEL LATA A/D |
| C05-M32-18 | Maneja Chunky adulto mayores | CHUNKY ADUL MAYORES | CHUNKY ADUL MAYORES; CHUNKY ADULTOS MAYORES |
| C08-M25-19 | Quiero un agility gol cachorros razas grandes | AGILITY GRAND CACH | AGILITY GRAND CACH |
| C09-M129-20 | freemiau lavanda 10kg | FREEMIAU LAVANDA | FREEMIAU LAVANDA |
| C09-M131-21 | y el br cordero 10kg | BR CORDERO | BR CORDERO |
| C09-M123-22 | me gustaría agregar una arena maíz 20kl | ARENA MAIZ CAT | ARENA MAIZ CAT |
| C10-M3-23 | Nutriss de 30kg de carne 🤗 | NUTRISS CARNE | NUTRISS CARNE |
| C14-M37-24 | Qué precio tiene el proplan para gatos EN? | ambiguous | PRO PLAN FELINE EN; PRO PLAN FELINE LATA EN |
| C17-M6-25 | y agility para grandes cachorros? | AGILITY GRAND CACH | AGILITY GRAND CACH |
| C18-M4-26 | cuido vivance vitality de 10 Kg | unverified_identity | RINGO CACHORRO; RINGO ADUL; RINGO PREMIUM CACHO; RINGO CREMA DE MANI; RINGO CROQUETAS; RINGO VITALITY ADUL; RINGO PREMIUN PRO; RINGO CROQUETA; RINGO PREMIUM; RINGO PREMIUM CACHORRO; RINGO VITALITY ADULTO; MIRRINGO +PRO; MIRRINGO GATITO; MIRRINGO + PRO; MIRRINGO |
| C18-M23-27 | BR pollo 3 kg Castrado | BR CAT CASTRADO POLLO | BR CAT CASTRADO POLLO |
| C20-M14-28 | que precio tienen Ringo croquetas x20kl? | RINGO CROQUETAS | RINGO CROQUETAS |
| C24-M4-29 | Que precio tienen el cuido Purina dog chow a r pequeña de 4kl? | presentation_unverified | DOG CHOW POUCHE CARNE; DOG CHOW POUCH PAG; DOG CHOW ADULRMG; DOG CHOW C RMG *; DOG CHOW A.R.P A GRANEL; DOG CHOW C RP; DOG CHOW C RMG; DOG CHOW ADUL TODOS LOS TAMAÑOS 475; DOG CHOW C RMG *475; DOG CHOW SINCO LONGEVIDAD; DOG CHOW POUCHE CACH; DOG CHOW CONTROL DE PESO; DOG CHOW CONTROL PESO SINCOL; DOG CHOW; DOG CHOW A RMG; DOG CHOW A.M.G A GRANEL; DOG CHOW ADUL RMG PAG 19.7 LLEV; DOG CHOW ADUL TODOS LOS TAMAÑOS |

### Destino y mensajes reales vinculados

Antes de enviar, se verificó en la ficha de WhatsApp Web el contacto **Kapso Sandbox, @kapso_sandbox, +56 9 2040 3095**. La API de Kapso devolvió **Sandbox WhatsApp**, canal **597907523413541**, coincidente con el configurado. El remitente de prueba y la conversación se resolvieron desde el entrante real del incidente y se cruzaron con el historial de Supabase; no se eligió un contacto de clientes de la lista lateral. El destino fue el Sandbox propio autorizado por el usuario. Esta verificación visual fue previa a los envíos; no se adjuntan capturas con datos personales.

Las filas siguientes son mensajes reales enviados desde WhatsApp Web y respuestas que Kapso registró, no eventos sintéticos ni replay. La entrega del proveedor se comprobó contra `webhook-deliveries.json`, y las respuestas se observaron en la misma conversación de WhatsApp Web. Los replays están separados en sus dos archivos y no suman mensajes salientes.

| Nº | UTC | Sentido | ID Kapso | Texto comercial / resultado |
|---|---|---|---|---|
| 1 | 2026-10-28T23:58:03.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDkzOTFBNUFCMEFFNjI1MEZFMwA= | y el tiene problemas urinarios, me recomendaron pro plan ur, cuanto cuesta? |
| 2 | 2026-10-28T23:58:32.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSRjdFRjY4ODYzNDBFRTI3NUFDAA== | ¿Es para perro o gato? Con eso te digo el Pro Plan UR que corresponde y su precio 💬 |
| 3 | 2026-10-28T23:58:49.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDEzNDJGQTc4QTVBOTgwOTE5MQA= | para perrito |
| 4 | 2026-10-28T23:59:18.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSNjJFQzJGNTRFNDFDNzJBRDA0AA== | Claro, te ayudo a encontrarlo. ¿Cuál referencia necesitas: PRO PLAN CANINE UR o PRO PLAN CANINE LATA UR? |
| 5 | 2026-10-29T00:03:04.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDc1NTY3RjI0QkFBQTA2OTE1MwA= | el concentrado |
| 6 | 2026-10-29T00:03:31.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSQzlFMDc4MTdDODg4NjcxNDA3AA== | Presentaciones y precios unitarios: - PRO PLAN CAT URINARY 1.5kg: $122.000 - PRO PLAN GATO URINARY 3kg: $192.900 |
| 7 | 2026-10-29T00:05:53.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEY4RTlBNzcwNUEwNTQzNDZBRgA= | y el tiene problemas urinarios, me recomendaron pro plan ur, cuanto cuesta? |
| 8 | 2026-10-29T00:06:12.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSQ0YzQUY2QjVCRUVEQTM4MUE1AA== | Para orientarte sobre diagnóstico o tratamiento se necesita criterio veterinario. Dejo tu consulta pendiente de un asesor para que te ayude con la orientación especializada. |
| 9 | 2026-10-29T00:07:28.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDhFRDI2RUEzOTFGNzY4MzhDQgA= | y el tiene problemas urinarios, me recomendaron pro plan ur, cuanto cuesta? |
| 10 | 2026-10-29T00:07:57.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSNzkxNTc3Njc5NkJFOTgwRDFCAA== | Claro, para ubicarte bien con Pro Plan UR, ¿es para perro o para gato? 🐾 |
| 11 | 2026-10-29T00:08:20.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEI0RjNBNDRBRTcyOTZFMjNFMgA= | para perrito |
| 12 | 2026-10-29T00:08:44.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSQThGMUM5RTgzRTQ0REQ2QzMzAA== | Sí, para perrito te puedo ofrecer PRO PLAN CANINE UR en 2 kg o PRO PLAN CANINE LATA UR en unidad. ¿Cuál de las dos necesitas? 🐾 |
| 13 | 2026-10-29T00:09:04.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDMzNTc1QTUwMTE3OTUzMjE0OAA= | el concentrado |
| 14 | 2026-10-29T00:09:30.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSMkFBOUQ2QjkyQzAwN0FGOEFFAA== | Presentaciones y precios unitarios: - PRO PLAN CANINE UR 2kg: $122.000 |
| 15 | 2026-10-29T00:09:45.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEMzMTQ4Q0VEQ0FDQTE4NjUxOQA= | ¿Qué precio tiene royal canon gastrointestinal para perro de 2kg? Solo cotización. |
| 16 | 2026-10-29T00:10:17.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSMjJENEE2QjhEMDg1RTFGQjM5AA== | ROYALCANIN GASTROINTESTINAL PERRO 2kg está en $129.000. ¿Quieres que te lo deje agregado? |
| 17 | 2026-10-29T00:10:32.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEVBQTJCOUFFQzY3MzE3NEYwMAA= | Ahora solo quiero saber cuánto vale Agility gold para cachorros |
| 18 | 2026-10-29T00:11:04.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSOUFDMENGNjBCRThDNzlEMUM3AA== | ¿Es para perro o gato? Así te digo el Agility Gold para cachorro que corresponde 🐶 |
| 19 | 2026-10-29T00:11:11.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDYzNDU2Qjk2MDJENjVFNkJDOAA= | para perro de raza grande |
| 20 | 2026-10-29T00:11:42.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSODMyQkVDQjJFMUE3RjZFMTQzAA== | Presentaciones y precios unitarios: - AGILITY GRAND CACH 1.5kg: $33.700 - AGILITY GRAND CACH 3kg: $65.400 - AGILITY GRAND CACH 15kg: $299.900 |
| 21 | 2026-10-29T00:11:56.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEI0RTlBOTVERjNENDM5MzlENgA= | el de 3 kilos, solo dime su precio |
| 22 | 2026-10-29T00:12:26.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSMDMwNTIzRkVBNDZDOUNDRjM0AA== | Presentaciones y precios unitarios: - AGILITY GRAND CACH 1.5kg: $33.700 - AGILITY GRAND CACH 3kg: $65.400 - AGILITY GRAND CACH 15kg: $299.900 |
| 23 | 2026-10-29T00:13:11.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDI0MDdFOUEyNzE3QUZBRUQzOQA= | el de 3 kilos, solo dime su precio |
| 24 | 2026-10-29T00:13:42.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSMjhCMTg4QzVCMjMzQjZFMkE1AA== | AGILITY GRAND CACH de 3 kg está en $65.400 🐶 |
| 25 | 2026-10-29T00:14:32.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDdBM0QxQURBNEJGMzVBMjVBQwA= | ¿Cuánto vale Diamond indoor cat? |
| 26 | 2026-10-29T00:14:40.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEQ2MzM0MEQ5MjZBOEZDMTIwMAA= | el de 500 gramos, solo precio |
| 27 | 2026-10-29T00:15:26.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSMDY5NDhCRDREQTc0MDkzRkRBAA== | No encuentro SOLO de 500g en el catálogo actual. No la he agregado al pedido. ¿Puedes confirmar el nombre completo y la presentación para revisarlo? |
| 28 | 2026-10-29T00:17:47.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEJGMDMwMDdBOUM0NURBNDM3OAA= | ¿Cuánto vale Diamond indoor cat? |
| 29 | 2026-10-29T00:17:52.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDIyQUQ3MzVGOEZEQTI1RTRFNAA= | el de 500 gramos, solo precio |
| 30 | 2026-10-29T00:18:36.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSMzc2Mjg3NTMzOERFNDFEQzJGAA== | Sí, DIAMOND INDOOR CAT de 500 gr te queda en $19.500 🐾 |
| 31 | 2026-10-29T00:19:00.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDY0RkNBMUM0NkZCQUFEODUwRgA= | ¿Tienen alimento marca ZetaPruebaQ9 referencia ZQ17 de 4 kilos? Solo consultar. |
| 32 | 2026-10-29T00:19:32.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSMTM2M0QyRDkyMzAxMzcwNEJFAA== | No encuentro ZETAPRUEBAQ9 ZQ17 de 4kg en el catálogo actual. No la he agregado al pedido. ¿Puedes confirmar el nombre completo y la presentación para revisarlo? |
| 33 | 2026-10-29T00:19:58.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEUzMUFCNTcyMkVCMkNDN0Q2NQA= | No tengo más datos ni foto de ese producto |
| 34 | 2026-10-29T00:20:24.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSRTU4NTI4QzFDQkU5QzlCMTk5AA== | Con la información disponible todavía no puedo confirmar esa referencia en el catálogo. No he agregado un producto distinto. Si consigues el nombre completo o una foto del empaque, puedo revisarlo; también puedes consultar otra referencia. |
| 35 | 2026-10-29T00:20:50.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMEFDQUUxRjg0MDI2RjNCNDY3NwA= | Mi perro está vomitando y con diarrea, ¿qué tratamiento y qué dosis le doy? |
| 36 | 2026-10-29T00:21:15.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSMzBGNEFGMTBFRUVEMjcxRDQ5AA== | Para orientarte sobre diagnóstico o tratamiento se necesita criterio veterinario. Dejo tu consulta pendiente de un asesor para que te ayude con la orientación especializada. |
| 37 | 2026-10-29T00:21:32.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMENGRjBBRERDRDZEN0Q5RDE3QgA= | y el tiene problemas urinarios, me recomendaron pro plan ur, cuanto cuesta? |
| 38 | 2026-10-29T00:22:04.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSRjJGNkI0NDI5NTRDNUM5NzE3AA== | Claro 🙂 ¿Es para perro o para gato? Con eso te confirmo el Pro Plan UR que aplica y su precio. |
| 39 | 2026-10-29T00:22:16.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDNCQjk3ODU2NUE1MjQ0NEIwNgA= | para perrito |
| 40 | 2026-10-29T00:22:49.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSOTkwMENDMEI5NTkzMTRBQzlDAA== | Para perrito, lo que me aparece es Pro Plan Canine UR de 2 kg o Pro Plan Canine Lata UR por unidad. ¿Cuál de las dos necesitas? 🙂 |
| 41 | 2026-10-29T00:23:18.000Z | inbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAEhgWM0VCMDYxRjJERUU1OENGRkVENjc0OQA= | el concentrado |
| 42 | 2026-10-29T00:23:49.000Z | outbound | wamid.HBgMNTczMTU4OTk0MTYzFQIAERgSODkwQTgwMUM5OTJEQUJGNDUxAA== | Presentaciones y precios unitarios: - PRO PLAN CANINE UR 2kg: $122.000 |

### Ambigüedad, cambio de producto y atención humana

La prueba final UR no fuerza una presentación: tras la especie distingue seco de lata, ambas referencias reales del catálogo. Después de «el concentrado» selecciona únicamente CANINE UR 2 kg. El cambio UR → Royal Canin → Agility → Diamond cambió marca, línea y especie sin arrastrar los atributos previos; Diamond para gato siguió a Agility de perro/cachorro y mantuvo 500 g, no los 3 kg anteriores. El carrito de gato ya existente tampoco fijó la especie de las consultas caninas.

El control inexistente ZetaPruebaQ9/ZQ17 tuvo cero coincidencias de marca en la lectura de Supabase; el agente no inventó otra referencia y, al no disponer el cliente de más datos, respondió incertidumbre sin crear una pausa comercial.

A las 00:20:50 se solicitó tratamiento/dosis; a las 00:21:15 derivó a criterio veterinario. A las 00:21:32 se volvió a pedir el precio de UR, y a las 00:23:49 llegó la cotización correcta. El estado `atencionHumana` siguió pendiente por criterio_veterinario: no se cerró ni se afirmó que hubiera un veterinario asignado. La misma conversación siguió activa para comercio. Atención `en_atencion` y solicitud explícita de humano se verificaron con tests automatizados: no se simuló un operador real en el Sandbox ni se alteró una conversación de una persona atendida por un humano.

### Revisión de lectura posterior al cierre

A 2026-10-29T00:29:57.071Z se verificó de nuevo PID 96737, ruta del proyecto, escucha en 3000 y salud ok. La huella permanecía igual a la cargada y a la registrada al cierre. El archivo de logs no cambió después de 2026-10-29T00:24:30.750Z; el último run seguía siendo el replay omitido por already_processed. Cero fallos de procesamiento y ningún error nuevo observado desde el cierre. La revisión no envió mensajes ni invocó IA. Evidencia: `read-only-followup.json`.
