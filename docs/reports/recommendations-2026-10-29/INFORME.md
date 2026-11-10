# Recomendaciones comerciales por necesidad — validación real 2026-10-29

## Estado

Implementación y validación real terminadas para los escenarios descritos. Con la ventana de control autorizada por el usuario, se enviaron 16 mensajes exclusivamente al chat verificado de Kapso Sandbox entre las 20:10 y 20:23 UTC y se recibieron 14 respuestas, todas con estado delivered en Kapso. Dos pares de mensajes se atendieron conjuntamente; no se crearon pedidos. El agente se recargó con la corrección final y la secuencia original se repitió después. Salud local y túnel público HTTP 200 al cierre, con código cargado coincidente con disco. Los apartados de evaluación en memoria son antecedentes, no se cuentan como mensajes reales.

Los bloqueos de acceso anteriores se resolvieron antes de estos envíos. No se operó la pestaña de trabajo del usuario ni se enviaron mensajes al cliente de la captura. La persistencia normal del agente escribió los mensajes y su estado; su mecanismo de revisión existente generó cuatro candidatos inactivos. No se aprobaron ejemplos, no se activó aprendizaje ni se modificaron catálogo, precios o esquema.

## Evidencia del caso y causa

La captura adjunta se materializó y se inspeccionaron sus píxeles (`source/client-example.png`). Muestra: “Quiero un dimicilio para un alimento para mi gato de 6 meses que me recomienda”; el agente termina respondiendo “No encuentro ALIMENTO MI GATO MESES en el catálogo actual”. Después de “Qué alimento tiene para gato cachorro” vuelve a decir que no encuentra “ALIMENTO GATO CACHORRO”. Ante “No sé el nombre del producto” pide nombre o foto.

La conversación se vinculó con Kapso mediante el prefijo de conversación visible, con una única coincidencia entre 26 registros consultados. `incident-kapso.json` conserva la trazabilidad: entrada inicial 2026-10-29 02:33:45 UTC, respuesta 02:34:13; segunda entrada 02:36:39 y respuesta 02:37:08. No se atribuye la identidad de ese contacto al usuario. Una búsqueda de esa frase en el historial configurado de Supabase no encontró registros; la evidencia del incidente procede de Kapso y la captura, no de tablas de entrenamiento.

La reproducción con el router real reconoció intención de recomendación. Sin embargo, la etapa posterior reutilizaba búsqueda y validación de identidad comercial contra la descripción de una necesidad. “Alimento gato cachorro” se trataba como referencia. El turno “No sé el nombre” caía en la incertidumbre comercial y volvía a pedirlo. Una lectura estructurada del catálogo encontró 21 referencias de comida para gato cachorro (`kitten-catalog.json`). La ausencia declarada no estaba justificada.

La primera vuelta de la reproducción basal agotó además el presupuesto existente de recuperación y dio un error temporal de catálogo. Es un resultado observado del replay, distinto de la respuesta histórica en la captura; no se presenta como causa probada de aquel mensaje.

## Cambios

- `src/services/aiContextOptimizer.js`: contrato semántico necesidad/referencia, criterios y presupuesto explícitos, contexto de recomendación y selección sustentada en atributos. Humanización específica que conserva las líneas verificadas del catálogo.
- `src/services/aiInterpreter.js`: normalización del contrato, candidatos seleccionados y evidencias por atributo.
- `src/repositories/productRepository.js`: lectura estructurada por empresa, categoría, especie y etapa; referencias y presentaciones activas, IDs y precios originales. Límite de 120 referencias y señal de truncamiento.
- `src/services/catalogRecommendationService.js` (nuevo): solicita solamente criterios útiles faltantes; filtra compatibilidad, presupuesto y presentación; selecciona hasta tres opciones entre un máximo de 40 candidatos, con IDs y evidencia del catálogo. Conserva la necesidad contextual sin modificar el carrito.
- `src/services/conversationService.js`: conecta la ruta de recomendación después del control clínico y antes del manejo de referencia no resuelta; conserva persistencia y modelos existentes. Garantiza la indicación de existencias por confirmar cuando corresponde.
- `test/catalogRecommendation.test.js`: seis pruebas de selección, evidencia, aislamiento, límites, recuperación de errores y conservación del estado.
- `scripts/evaluation/recommendations-live.js`: evaluación opt-in con modelos configurados y Supabase real en lectura; persistencia sustituida por memoria y salidas de WhatsApp bloqueadas.

No se añadieron listas de productos, marcas o frases para resolver el ejemplo. La taxonomía usada es la existente en el catálogo. No hubo migraciones, modificaciones de precios, cambios de modelos, escrituras de catálogo ni cambios del buffer o checkout. El selector semántico sigue siendo probabilístico: la comprobación literal de evidencia evita citas inventadas, pero por sí sola no demuestra todas las relaciones semánticas.

## Comparación y verificación

Los archivos JSON conservan intentos fallidos e intermedios, no solo resultados favorables. Son ejecuciones del servicio con modelo y catálogo reales, con estado e historial en memoria: **no son mensajes enviados a Kapso**.

| Evaluación | Turnos | Resultado | Mediana / rango de tiempo |
|---|---:|---|---|
| Basal, tres mensajes de captura | 3 | Error temporal, falsa ausencia y petición de nombre; ninguna recomendación resuelta | 11.874 ms / 5.444–14.194 ms |
| Matriz intermedia, 10 escenarios | 18 | Identificó además fallos de evidencia, snacks, accesorios y tamaño; motivaron correcciones | 9.686 ms / 4.941–14.181 ms |
| Revisión dirigida posterior, 5 escenarios | 7 | Tres vueltas de captura resueltas; presupuesto, cachorro pequeño, snacks y accesorios con opciones reales | 10.464 ms / 7.998–12.536 ms |

La comparación no es un benchmark controlado ni prueba una mejora de latencia: cambian los escenarios y la latencia del proveedor. La recuperación estructurada tiene un timeout de 4,5 segundos; ese límite no incluye todas las llamadas de IA.

En la revisión dirigida, el gato de seis meses recibió opciones como MIRRINGO GATITO 500gr a $5.900, OHMAIGAT GATITOS 200gr a $3.800 y PRO PLAN POUCH FELINO KITTEN 85gr a $6.200, tomadas del catálogo. “No sé el nombre” conservó la necesidad y ofreció opciones sin exigirlo. Las opciones para raza pequeña correspondieron a referencias con evidencia de ese tamaño. Los importes se documentan como observados en esta fecha, no como precios permanentes.

La matriz intermedia verificó también: aclaraciones de especie y edad en turnos cortos, presupuesto posterior, cambio de gato cachorro a perro adulto, referencia concreta Pro Plan UR → perro → concentrado → CANINE UR 2kg/$122.000; referencia inexistente sin sustitución forzada; consulta clínica derivada. Estos escenarios no se repitieron con el modelo después de cada ajuste final. Todos los carritos permanecieron intactos: 3/3 basal, 18/18 matriz y 7/7 revisión dirigida.

Una respuesta de la revisión dirigida omitió la advertencia de stock al humanizar. Se añadió una salvaguarda final para conservarla. La evaluación independiente posterior, descrita a continuación, sí ejecutó esa salvaguarda con el modelo real.

Suite inicial: **998/998**. Suite del primer checkpoint: **1.004/1.004**, cero fallos, cancelados u omitidos (6,9 segundos). Log local: `/tmp/veltia-recommendations-tests-checkpoint.log`. No se cambiaron tests existentes para hacerlos pasar.

## Comprobación independiente posterior del código final

Sin Computer Use, navegador, servidor ni WhatsApp, se ejecutó `final-code-verification.json`: 14 turnos en seis escenarios (captura, adulto, contexto, referencia, ausente y clínica), con persistencia e historial en memoria. El primer intento en el entorno restringido falló por DNS antes de ejecutar conversaciones; la ejecución con acceso de red autorizado completó 37 llamadas a OpenAI y las lecturas de Supabase sin respuestas HTTP de error. Se mantuvieron `gpt-5.4-2026-03-05` y `gpt-5.4-mini-2026-03-17`.

- Captura: 3/3 respuestas con opciones reales y advertencia de existencias por confirmar, incluida “No sé el nombre”.
- Adulto: opciones de concentrado para gato adulto con presentación y precio registrados.
- Contexto: pregunta especie, pregunta etapa, usa los cinco meses y luego el presupuesto de $25.000. Al cambiar a perro adulto, el estado registra perro/adulto y presupuesto null: no arrastra el límite ni la especie anteriores.
- Referencia: pregunta perro/gato, distingue concentrado y lata, y obtiene PRO PLAN CANINE UR 2kg/$122.000.
- Ausente: no sustituye la referencia inventada ni agrega productos.
- Clínica: deriva por criterio veterinario, sin recomendar comida como tratamiento.

Carrito intacto 14/14. Las siete respuestas que ofrecieron recomendaciones incluyeron la advertencia de stock desconocido. Mediana 11,31 segundos, rango 5,06–14,73 segundos; no se infiere una mejora de rendimiento de esta muestra.

Esta ejecución reveló un defecto adicional: la respuesta de referencia concreta afirmó “está disponible” aunque su presentación tenía stock null. La frase procedía de `bloqueConsultaConfirmada`, en `src/verticals/petshop/orderLogic.js`. Se ajustó esa apertura y se agregó la advertencia cuando las existencias no están confirmadas. `src/services/humanizer.js` conserva esa advertencia y distingue equivalencia de presentación de disponibilidad. Se añadió una regresión sintética sin marcas reales; no se modificaron catálogo, selección comercial ni operaciones del carrito.

Suite después de esta corrección: **1.005/1.005**, cero fallos, cancelados u omitidos, 7,0 segundos (`/tmp/veltia-recommendations-final-stock-tests.log`). La repetición real específica se conserva por separado en `final-stock-regression.json`: tres turnos completados, carrito intacto 3/3, mediana 12,00 segundos (11,88–12,09). Su respuesta final fue “Te confirmo, esa referencia la manejamos: PRO PLAN CANINE UR 2kg por $122.000. Las existencias están por confirmar.” Ya no afirmó existencias disponibles. No se repitieron las necesidades generales tras este ajuste exclusivo de la respuesta de referencia; sus resultados previos y la suite se mantienen como evidencia diferenciada. Las huellas de los archivos se guardan en `final-code-hashes.json`. En ese momento aún estaba pendiente la validación del canal real, completada en la fase siguiente.

## Validación end-to-end posterior y último ajuste

Se verificó el perfil de Kapso Sandbox en WhatsApp Web y el destino previamente autorizado. El servidor se encontraba detenido al retomar, por lo que se inició únicamente el agente en el puerto libre 3000. No se reinició el túnel ni se modificaron credenciales. La conversación de prueba actual quedó identificada por Kapso y por la resolución sandbox del tenant `distrifinca`; no se dedujo identidad a partir del nombre de un cliente ajeno.

La primera ejecución real detectó una diferencia respecto del replay: el clasificador inicial podía elegir el perfil `producto`, cuyo ahorro de llamadas omitía el humanizador aunque el router posterior hubiera identificado una necesidad. El catálogo ya se recuperaba correctamente, pero las dos primeras respuestas conservaban una apertura fija. Se añadió una excepción general en `omitirHumanizadorProducto` para `recomendacionCatalogo`, sin cambiar modelos ni las búsquedas concretas. Se agregó una prueba y la suite final quedó en **1.006/1.006**, cero fallos, cancelados u omitidos (7,1 segundos, `/tmp/veltia-recommendations-e2e-tests.log`).

Se esperó a que terminara la respuesta en curso, se detuvo exclusivamente el proceso creado para la prueba y se recargó el agente. El proceso final es PID **12012**, sesión de ejecución **18773**, inicio **2026-10-29T20:14:24.628Z**, huella `cc2d18d8a17e5d01cf408e96a64ab6eb62a46606c8a6cda8726e8bbe595eba01`. Después de esa recarga se enviaron 13 mensajes y se entregaron 11 respuestas. Sumados los tres turnos previos, el total real es 16 entradas y 14 salidas.

| Caso real | Resultado observado |
|---|---|
| Captura original, repetida tras recarga | Comida para gato cachorro con opciones y precios reales; pregunta por formato, sin pedir un nombre comercial |
| “No sé el nombre del producto” | Conserva gato cachorro y ofrece opciones; no deriva ni exige referencia |
| Premios para perro adulto + presupuesto, enviados seguidos | Ambos entrantes persisten en un mismo turno y producen una sola respuesta con opciones dentro de $20.000 |
| Cambio a juguetes para gato | Dos opciones dentro de $25.000; no arrastra perro/adulto ni el presupuesto anterior |
| Pro Plan UR → “Para perrito” | Pregunta especie, conserva la referencia y distingue CANINE UR 2kg y CANINE LATA UR |
| “el concentrado” + aclaración durante procesamiento | El primer resultado queda superseded con cero partes enviadas. La siguiente respuesta informa CANINE UR 2kg/$122.000, sin agregarlo |
| Consulta clínica de prueba | Deriva por criterio veterinario, sin indicar alimento como tratamiento |
| Consulta comercial después de la clínica | Responde con juguetes y precios; conserva el estado clínico pendiente, sin silenciar el turno |
| Referencia inexistente | Informa que no la encuentra; no sustituye por otra ni deriva por incertidumbre comercial |

Las utilidades nuevas `scripts/evaluation/recommendations-observe.js`, `recommendations-catalog-evidence.js` y `recommendations-summarize.js` recopilan o analizan evidencia sin modificar datos externos. Los datos de `e2e-final.json` y `e2e-summary.json` contienen IDs, tiempos, cuerpos y estados de Kapso, junto con mensajes persistidos de Supabase. Hay **cero claves de evento duplicadas**, **cero pedidos nuevos** y carrito vacío antes y después. Esta prueba real no acredita conservación de un carrito con artículos; esa cobertura corresponde a las pruebas automatizadas y al replay con carrito precargado.

El resumen por turnos de persistencia contiene un grupo entrante sin salida propia: es la ejecución superseded documentada, no un mensaje desaparecido. La respuesta posterior retiene la selección “concentrado” y resuelve el precio. Por ello el campo estricto `allTurnsAnsweredOnce` es false; no se presenta como un conteo de mensajes perdidos ni se fuerza una relación 1:1 cuando el buffer agrupa o el coordinador sustituye una respuesta. Los logs registran 15 ejecuciones: 14 sent y una superseded, con cero errores internos detectados. Todas las 14 salidas tienen acuse delivered del proveedor; no se afirma garantía universal de exactly-once.

`e2e-catalog-verification.json` contrasta **25 opciones ofrecidas en nueve respuestas de recomendación**, correspondientes a **11 referencias**, contra IDs, presentaciones y precios actuales de Supabase: **25/25 verificadas**. La identidad y el precio de CANINE UR se documentan además en la respuesta real y en sus trazas de consulta. Las respuestas de recomendaciones mantienen la incertidumbre de stock; el precio de una referencia registrada no se usa como prueba de existencias.

Latencia del pipeline, incluido el buffer de cinco segundos: mediana de los 14 envíos **20,51 s**, rango **14,31–23,27 s**. El caso de mensaje adicional durante procesamiento tardó **43 s** desde “el concentrado” hasta la respuesta final, porque descartó el resultado anterior y procesó la aclaración. No se afirma reducción de latencia. La humanización contextual añade una llamada en recomendaciones que antes se omitían; conserva la validación y puede devolver el texto base si el modelo elimina un precio u otro dato protegido.

La observación inicial auxiliar devolvió vacío al filtrar por la fila directa de canal; se corrigió para usar la misma resolución sandbox del agente. Ese archivo inicial no se usa como prueba de ausencia de persistencia. La consulta inicial de la utilidad Kapso también falló por anexar la ruta de plataforma a una base de API con prefijo; se corrigió usando su origen, sin modificar configuración del servidor. Ambos fueron errores del recolector de evidencia, no del recorrido de mensajes.

Verificación final a las **20:25:39 UTC**: salud local y pública correctas, huella cargada igual a disco, cero errores internos en el log de esta ejecución. `e2e-final-health.json` conserva esa evidencia y verifica que los cuatro candidatos de revisión generados por el flujo existente están inactivos.

## Límites y operación

1. La validación acredita los mensajes de texto y escenarios enumerados. No se enviaron nuevas imágenes o audios, no se forzó una reentrega del mismo webhook ni se simularon caídas de proveedor durante estos envíos; la compatibilidad y deduplicación restantes se apoyan en la suite existente. Los resultados no garantizan comprensión perfecta de cualquier consulta ni ausencia universal de duplicados.
2. El proceso estaba activo al cierre en una sesión gestionada de ejecución. No se instaló un servicio permanente ni se garantiza que permanezca activo al terminar o caducar esa sesión. La tentativa de abrir Terminal para dejarlo en una sesión local fue denegada por la herramienta: “Computer Use is not allowed to use the app 'com.apple.Terminal' for safety reasons.” No se reintentó ni se abrió Terminal mediante otra vía; el proceso en marcha no se detuvo por esa denegación.
3. Las pruebas no ejecutaron pedidos, cobros ni cambios de operador humano. La atención humana activa y el checkout se preservan en la suite; no se probaron sobre conversaciones de terceros.
4. El límite de recuperación y la selección de hasta 40 candidatos pueden omitir opciones en categorías grandes. No debe interpretarse falta de opciones verificadas como ausencia global. Los atributos incompletos del catálogo limitan las recomendaciones justificables.
5. La selección inicial ordena por precio y representa una presentación por referencia; no constituye una comparación nutricional ni una clasificación de calidad. No se recomienda tratamiento de síntomas.

El trabajo queda preservado y validado por el canal real para los casos descritos. Log separado: `.tmp/recommendations-runtime-20261029.log`. No hubo publicación, push ni instalación de servicio. La limitación operativa pendiente es la permanencia del proceso fuera de la sesión de ejecución; no falta ya la reproducción real de recomendaciones.
