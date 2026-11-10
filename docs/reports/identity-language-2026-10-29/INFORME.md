# Identificación y conversación contextual — 29 octubre 2026

## Estado

La mejora de identificación quedó cargada en el Sandbox con **1.027/1.027 tests**. La corrección posterior del aviso técnico está **solo en código local, aún no cargada**; sus resultados se detallan en la adenda. El caso original respondió correctamente en WhatsApp con la versión final. **La ronda E2E final está incompleta:** el segundo mensaje llegó, pero OpenAI devolvió `429 credit_balance_exhausted` (saldo agotado). Se detuvieron los envíos y las llamadas al modelo. No se cambió modelo ni facturación.

No se trabajó en número real, coexistencia, panel ni integración de asesores. Sigue el registro pendiente honesto existente.

## Procedencia

Esta pasada usa pruebas redactadas por el agente para el Sandbox propio, modelos reales y catálogo Supabase de solo lectura. No son conversaciones de clientes. No se volvió a contar el corpus anterior de 24 registros/1.885 mensajes. Las consultas a `training_examples` del flujo existente son ejemplos, no historial de ventas.

«diamon indor» proviene de `typo-tone`, prueba sintética anterior sobre una referencia real. «Monello CAT Lunar ZQ88» es un control negativo inventado, no un producto ni mensaje de cliente real. No se insertaron productos.

Se guardó el catálogo consolidado en `catalog-snapshot.json` para reproducir el validador. Cinco referencias se contrastaron además directamente por ID, presentación, precio y stock en `catalog-expected.json`.

## Causas comprobadas

1. **Medida mezclada con identidad:** «medio» y «kilo» se contaban como palabras del producto. Aunque el intérprete proponía 500 g, faltaba una normalización verificable y el validador rechazaba la consulta.
2. **Errata de variante:** «indor» no activaba la condición indoor. Con «diamon indor gato 500g», la validación sobre el catálogo real favorecía **DIAMOND KITTEN CAT**, incorrectamente. La referencia correcta recibía una penalización por condición supuestamente ausente.
3. **Contexto de recomendación frente a carrito:** una evaluación real preguntó por Monello; la aclaración «el de salmón, un kilo» retomó BR CAT SALMON del carrito y mostró un pedido. El carrito no cambió, pero sí se perdió el foco comercial. Otras ejecuciones conservaron Monello y repitieron la pregunta de edad en vez de verificar la variante. El prompt por sí solo no resolvió esta última rama.
4. **Códigos alfanuméricos:** la protección de siglas cortas no cubría ZQ88; el negativo podía ofrecer otras variantes de la marca. Ahora el código debe estar respaldado por el nombre; x20kl y x100 siguen siendo medidas/cantidades.

## Archivos y lógica

- `src/utils/catalogQueryNormalization.js`, nuevo: separa expresiones completas de medida y corrige tokens contra el vocabulario del catálogo recibido. Exige token alfabético de al menos cinco letras, distancia Damerau–Levenshtein uno y un único destino. Conserva palabras exactas, códigos y correcciones ambiguas. No contiene marcas ni referencias fijadas en código. La gramática de medidas es general pero acotada.
- `src/services/productMatchValidator.js`: normaliza antes de derivar señales de variante; tras una corrección, los bonos de marca/especie/peso no compensan una variante sin respaldo.
- `src/utils/text.js`: extrae presentaciones en palabras para continuidad; distingue códigos alfanuméricos de medidas y multiplicadores.
- `src/services/catalogRecommendationService.js`: una aclaración semántica de consulta que concreta marca y variante pasa a recuperación y validación existentes con atributos acumulados. No selecciona ni agrega productos. No se aplica a compra explícita, solicitud nueva o múltiples productos.
- `src/services/conversationService.js`: conecta esa transición y deja de conservar la necesidad anterior cuando el router identifica una referencia explícitamente nueva.
- `src/services/aiContextOptimizer.js`: la pregunta comercial vigente tiene prioridad sobre una selección antigua del carrito para aclaraciones. Completar preferencias no autoriza compra.
- Tests: `catalogQueryNormalization.test.js`, `catalogRecommendation.test.js`, `productRecoveryContext.test.js`. Un replay de BRABECTO ahora reconoce familia y pregunta peso/especie, sin elegir una presentación farmacológica.
- Evaluación: `scripts/evaluation/identity-language-{probe,evidence,summary}.js` y ampliación de `recommendations-live.js`.

Se conservaron cambios anteriores. No se modificaron modelos, catálogo, precios, esquema SQL, buffer, motor de carrito, checkout o facturación. Sin push ni publicación.

## Comparación antes/después

Tres consultas deterministas contra el mismo catálogo real guardado; no es una tasa general de miles de referencias:

| Entrada | Antes | Después |
|---|---|---|
| diamon indor para gato medio kilo | Sin coincidencia confiable | DIAMOND INDOOR CAT, 500 g |
| diamon indor gato 500g | DIAMOND KITTEN CAT, incorrecto | DIAMOND INDOOR CAT, 500 g |
| DIAMOND INDOOR CAT 500g | Correcto | Correcto |

Identidad correcta **1/3 → 3/3**; selección incorrecta **1/3 → 0/3**; sin coincidencia **1/3 → 0/3**. En los dos casos alterados: **0/2 → 2/2**. Evidencia antes guardada antes del cambio, no reconstruida con mocks: `deterministic-before.json`, `deterministic-final.json`, `comparison.json`.

Modelo/Supabase reales, antes: «Entendido: buscas el precio de Diamond Indoor Cat para gato, en presentación de 500 g. ¿Quieres que te ayude a revisarlo?». Primera corrección: «Te confirmo, esa referencia la manejamos: DIAMOND INDOOR CAT 500gr por $19.500. Las existencias están por confirmar. 🐱». Carrito preexistente en memoria intacto.

### Muestra independiente con modelo real

| Solicitud | Resultado observado |
|---|---|
| monelo cat salmon de un kilo | MONELLO CAT SALMON, 1 kg, $27.300 |
| cat chow delicrne, quinientos gramos | CAT CHOW DELICARNE, 500 g, $13.700 |
| agilty gatito de medio kilo | AGILITY GATITO, 500 g, $16.900 |
| Monello para gato → salmón, un kilo | Aclara variante → MONELLO CAT SALMON, 1 kg, $27.300 |
| Cambio a Nutrecan adulto raza pequeña, dos kilos | NUTRECAN ADULTO RP, 2 kg, $25.000, sin heredar gato |
| Monello CAT Lunar ZQ88, un kilo, sintético | No confirmó producto/precio; ofreció seguir una búsqueda |

Las tres primeras están en `independent-live.json`, versión intermedia. Las ramas ajustadas después se repitieron en `context-final-verified.json` y `pending-discovery-resolved.json`. **No se presentan todos los turnos como pruebas de la última versión.**

La reproducción final del estado problemático, con carrito distinto ya poblado, respondió: «Te confirmo, esa referencia la manejamos: MONELLO CAT SALMON x 1kg por $27.300. Las existencias están por confirmar. 🐾». No volvió a preguntar edad ni agregó al carrito.

Hubo **19 turnos de evaluación** con modelos reales y persistencia en memoria durante las iteraciones, y 53 respuestas de modelo registradas entre clasificación, mapeo y redacción. No son 19 éxitos finales: se conservaron los fallos intermedios. Estas evaluaciones no envían WhatsApp ni crean pedidos remotos.

## WhatsApp real y bloqueo externo

Destino comprobado en UI: **Kapso Sandbox, @kapso_sandbox, +56 9 2040 3095**. No se tocaron chats de terceros.

Hubo un envío intermedio correcto y **dos entrantes tras el reinicio final**:

1. Entrada `c9b80aac-1a6b-6dbb-0d0f-d1b4dce1c3d6`, 22:13:46.689 UTC: consulta «diamon indor … medio kilo». Salida `86d3b9a6-353d-96e6-0780-b293155bdf2a`, 22:14:16.466 UTC: **«DIAMOND INDOOR CAT 500gr te queda en $19.500. Las existencias están por confirmar. 🙂»**. Kapso confirma entrega.
2. Entrada `a838fd08-07f6-a7c5-d86e-8ba8c5d8719e`, 22:14:45.431 UTC: Cat Chow con errata y quinientos gramos. Recibida y persistida; **no hay salida**. OpenAI rechazó generación por saldo agotado y el log confirma liberación del lock.

Ronda final: **2 entrantes, 1 respuesta entregada, 1 generación bloqueada por créditos**. Cero claves de evento duplicadas, cero pedidos creados, carrito Sandbox vacío intacto. No se volvió a probar una ráfaga en esta pasada. El mensaje fallido quedó registrado; no se afirma que será reintentado automáticamente.

**Bloqueo exacto:** generación mediante OpenAI, modelo configurado gpt-5.2, fase real de resumen de memoria, anterior al router; error `429 credit_balance_exhausted`, «You have no credits remaining». Acción fallida, no pendiente de aprobación y no incierta. La entrada sí ocurrió; la respuesta no se envió. Se detuvieron nuevas pruebas al detectarlo; no se compraron créditos ni se cambió el modelo.

Pendiente tras el aviso explícito del usuario de que haya crédito: comprobar que sigue sin salida y recuperar una vez el evento original con sus identificadores, sin crear un mensaje nuevo; después completar el turno fallido y completar E2E de otras referencias, aclaración/cambio de producto y negativo. No requiere conectar un número real.

## Latencia y runtime

- Modelo/Supabase en memoria, principal: **16.492 ms antes; 13.551 ms** en primera corrección. Dos observaciones individuales, sin inferencia estadística.
- Validador sobre catálogo completo: antes **2.775/1.906/42 ms**; después **65/51/51 ms** para los tres casos. No es latencia de producción ni ensayo repetido de rendimiento.
- WhatsApp final correcto: **29.777 ms** entre persistencia de entrada/salida; **31.393 ms** con buffer. El intento bloqueado terminó en 9.063 ms sin respuesta y no cuenta como éxito.
- Suite final: **1.027 aprobados, 0 fallidos, 0 omitidos**, 7.217 s. Log `/tmp/veltia-identity-suite-final.log`. `git diff --check` limpio.
- PID **18929**, inicio **22:13:06.977 UTC**. Huella cargada en aquel reinicio (antes de la corrección técnica local de la adenda): `2b29de5cf541c393b36576794d6ac7e88e028c7538864be55373cd82e6397951`.
- HTTP 200 local a **22:16:24 UTC**. **El healthcheck no implica que OpenAI pueda responder: sigue bloqueado por saldo.** Servidor temporal de sesión, sin instalación permanente.

## Límites

Muestra pequeña y sintética; no acredita inteligencia universal, aprendizaje de clientes ni ausencia universal de pérdidas/duplicados. La corrección se limita al catálogo recuperado y a una edición inequívoca. No incorpora aliases aprendidos ni inventa candidatos no recuperados.

Los cambios no sustituyen todos los filtros históricos: combinaciones arbitrarias de marca y descriptores desconocidos sin código requieren ampliar cobertura adversarial. Durante desarrollo se observó ese riesgo en una familia sintética y se protegió la nueva ruta de corrección; no se declara resuelto todo posible falso positivo anterior.

El negativo con código no produjo selección en evaluación real, pero su prueba WhatsApp final quedó pendiente por créditos. La muestra independiente completa tampoco se repitió E2E con la última versión. Audio/imagen no se probaron de nuevo en vivo; sus regresiones existentes pasan. No se introdujeron embeddings ni SQL: este fallo no justificaba esa complejidad.

La falta de créditos es una limitación operativa externa, no un fallo de recuperación ni algo que se solucione reiniciando. **La validación externa completa no se da por terminada.**


## Adenda — silencio técnico antes del router, 29 octubre 2026

### Fe de erratas y evidencia del incidente

La versión inicial atribuyó el 429 a «mapeo» por la etiqueta genérica del catch de `aiInterpreter.js`. La secuencia real fue **historial → resumen de memoria con gpt-5.2 → 429 → retorno null → excepción «No se pudo actualizar la memoria conversacional»**. El router y su aviso de respaldo todavía no se habían ejecutado. No fue un fallo de reconocimiento de Cat Chow, de búsqueda de producto ni del envío Kapso.

La auditoría local guardada en `cat-chow-recovery-audit.json` corresponde al entrante `a838fd08-07f6-a7c5-d86e-8ba8c5d8719e`, run `0b69480f-a27d-4f75-b1e3-aa096627b8be`, hash de turno `bf65793d213d5692`. A las 22:16:21.932 UTC no había salida, intento de envío, interpretación ni ID marcado como procesado. El servidor liberó el lock; el evento permaneció almacenado, pero **no existe una cola durable que lo reintente automáticamente**. El webhook confirma recepción tras persistir la entrada, antes de terminar el agente: no se debe asumir que Kapso lo reenviará.

### Corrección local

- `src/services/conversationService.js`: cubre excepciones de carga de historial, resumen de memoria y router con un único aviso técnico sin llamar al humanizador ni a otro modelo. Registra la etapa específica y conserva el evento como reintentable. El texto es literal y deliberadamente técnico: «No pude procesar tu mensaje en este momento por un problema temporal. Por favor, inténtalo nuevamente.» No lo presenta como producto ausente ni derivación a un asesor.
- `src/conversation/conversationStore.js`: añade al JSON de estado `avisosTecnicos`, con reserva previa al envío y confirmación separada. No requiere SQL ni cambio de esquema. La salida técnica tiene una clave distinta de la futura respuesta comercial, y no adelanta la pregunta comercial, aprendizaje, pedido ni IDs de negocio procesados.
- `src/services/conversationScheduler.js`: ejecuta la reserva antes de enviar únicamente si el lote sigue vigente; distingue `technical_notice` del éxito comercial. Libera el recibo de deduplicación en memoria para permitir una reentrega explícita futura, sin autoencolar ni reintentar continuamente un proveedor sin saldo. El buffer y sus temporizadores no cambiaron.
- `test/technicalNoticeRecovery.test.js`: integra servicio, almacén y coordinador reales con proveedores y repositorio simulados. No contiene llamadas de red.

Una reentrega puede volver a intentar el procesamiento, pero un aviso ya reservado/enviado no se repite. Cuando el procesamiento se recupera, el mismo evento puede producir su respuesta comercial y entonces sí queda marcado como procesado. No se retrocede la memoria válida: si una página se resumió y persistió antes de fallar la siguiente, se conserva ese cursor confirmado.

### Validación local y límites

**Suite completa final: 1.039 aprobados, 0 fallidos, 0 omitidos, 7.206 s; 12 regresiones nuevas frente a la base de 1.027.** `git diff --check` limpio. Log reproducible local `/tmp/veltia-technical-notice-suite.log`; resumen guardado en `technical-notice-local-tests.json`.

La nueva cobertura incluye resumen null y excepción 429, lectura de historial fallida, router null y excepción, reentregas en el mismo proceso y tras recrear el coordinador, duplicados concurrentes, lote superado por un nuevo mensaje, transporte incierto, reserva fallida, confirmación persistida fallida después del envío, segunda página de memoria fallida y éxito normal. Verifica carrito intacto, ausencia de pedidos/aprendizaje por el aviso, ningún consumo prematuro del evento y recuperación posterior con salida comercial separada.

La reserva es conservadora: si el transporte tiene un resultado incierto, no se reenvía el aviso a ciegas. Si no se logra guardar la reserva, se registra el fallo y no se envía sin protección. Los recibos están acotados a los últimos 256 eventos, en consonancia con el límite de recibos del estado existente. La exclusión concurrente conserva el alcance del coordinador actual en un proceso; no se añade un bloqueo distribuido ni se promete entrega exactamente una vez entre varias instancias. Un fallo previo a disponer de cliente/estado o una indisponibilidad persistente del almacenamiento sigue fuera de esta cobertura puntual.

**No se reinició ni recargó el servidor, no se llamó a OpenAI, no se escribió en Supabase y no se envió ningún mensaje Kapso en esta corrección.** No se cambiaron modelos, credenciales, facturación, catálogo, carrito ni checkout. La entrada real Cat Chow sigue pendiente de recuperación verificada; no fue reproducida ni se le envió este aviso retroactivamente. La próxima prueba real espera el aviso explícito del usuario sobre el saldo. El resultado local no sustituye la validación WhatsApp pendiente.
