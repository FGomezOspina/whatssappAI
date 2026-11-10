# Respuestas naturales y revisión comercial de referencias

Actualizado el 29 de octubre de 2026. Proyecto WhatsappVELTIA.

## Resultado actual

Implementadas la redacción contextual de incertidumbre, la separación entre consulta informativa y resumen de pedido, y la nueva política solicitada por el usuario: tras búsquedas y aclaraciones útiles sin resolver la referencia, registrar revisión de un asesor también por motivo comercial.

**1020/1020 pruebas automatizadas aprobadas.** Se verificaron nueve turnos reales del Sandbox con esta política: seis antes del último ajuste de conservación de la solicitud y tres después de cargar ese ajuste. Los nueve tuvieron una respuesta entregada cada uno, sin claves de evento duplicadas ni pedidos creados. El carrito vacío del Sandbox permaneció vacío; un carrito preexistente no vacío se verificó por separado en memoria.

**Límite operativo importante:** el sistema registra el pendiente en Supabase, pero todavía no tiene una notificación, una asignación ni un panel de atención humana configurados. No se ha entregado efectivamente la consulta a una persona. El agente comunica esa situación y continúa atendiendo consultas comerciales; no promete que un asesor fue avisado o que responderá en un plazo. Falta definir e integrar el canal de atención humana para completar ese traspaso real.

El usuario liberó el PC y se completaron las pruebas de interfaz. Ya no está pendiente la autorización para controlar WhatsApp. La pregunta asíncrona sobre canal/destinatario humano se dejó fuera del alcance actual: no hay una aprobación de herramienta ni un proceso detenido esperando esa respuesta. No se obtuvo un identificador de esa pregunta ni una herramienta de cancelación.

## Procedencia de ZetaPruebaQ9 ZQ17

Es una identidad ficticia elegida para una prueba negativa por el agente de desarrollo. No procede de un producto de Supabase, de un cliente ni de una tabla de entrenamiento.

El fixture `scripts/evaluation/recommendations-live.js` contiene el caso `absent`, con «Precio de marca ZetaPruebaQ9 referencia ZQ17». La variante exacta consultada por el usuario —«Solo consultar: tienen marca ZetaPruebaQ9 referencia ZQ17 de 4 kilos?»— fue enviada por este agente al Sandbox verificado el 29 de octubre a las 20:23 UTC. Su propósito era comprobar que no se inventara una coincidencia, un precio ni disponibilidad.

Evidencia original: `../recommendations-2026-10-29/e2e-final.json`, entrada `bf0152db-4d93-b3a3-fb89-63c6e0322410` a las 20:23:23 UTC y salida `613a364e-b1ae-8808-2b44-b2e16541533e` a las 20:23:45 UTC. No hubo una coincidencia comercial validada. Esto no prueba la inexistencia universal de ese nombre ni autoriza a declarar que la tienda no maneja un producto.

Debí advertir que era ficticia antes de enviar la prueba. No se creó ninguna referencia artificial en el catálogo. Esta auditoría demuestra el fixture y el envío concreto; no reconstruye el primer momento histórico en que se eligió la cadena de prueba.

## Causas y cambios

1. **Texto fijo ante cero coincidencias.** El humanizador evitaba generar una respuesta y devolvía una plantilla sobre el catálogo, repitiendo nombre y presentación conocidos. Ahora usa la ruta de redacción existente, con datos y restricciones estructurados, y mantiene una contingencia segura si falla la generación.
2. **Pregunta obligatoria incluso cuando no ayudaba.** El validador rechazaba ofertas condicionales sin signos de interrogación. Ahora distingue petición de datos, orientación por necesidad, búsqueda consentida, cierre explícito y revisión registrada. Agotar pistas no significa que el cliente quiera terminar la compra.
3. **Foto solicitada pese a no estar disponible.** El router interpreta `recursosAclaracion` de forma semántica. El redactor no puede pedir un recurso marcado como no disponible ni volver a pedir atributos conocidos.
4. **Carrito pegado fuera del modelo.** El servicio adjuntaba el resumen antes de redactar y el humanizador lo conservaba como bloque protegido. Separar el prompt no podía eliminarlo. La presentación ahora usa la intención y operación interpretadas: una consulta informativa omite ese bloque; una solicitud explícita de carrito, una compra, una operación mixta o un avance del pedido lo conserva. No se muta el carrito.
5. **Revisión comercial sin silencio.** Tras búsqueda y aclaraciones agotadas se persiste `producto_no_resuelto` con política `revision_comercial_v1`, notificación no configurada y asignación nula. Se confirma solo después de guardar. El pendiente comercial automático no silencia consultas posteriores; un operador realmente en atención y una petición explícita de humano conservan su prioridad. La revisión clínica previa se mantiene.
6. **Seguimiento que reemplazaba el resumen del asesor.** En la auditoría real, «no tengo foto…» podía sustituir la descripción original del pendiente. Se conserva ahora una solicitud inicial independiente con mensaje, términos y presentación. El seguimiento actualiza el estado sin perder esa referencia. La repetición final confirmó en Supabase la permanencia de ZetaPruebaQ9 ZQ17 y 4kg.

La derivación comercial no nace de una palabra, marca o producto codificado. Se basa en el resultado validado, los recursos disponibles y el progreso de las aclaraciones. Una primera ambigüedad con un atributo útil se aclara; un fallo técnico de consulta no se trata como ausencia ni consume intentos de identificación. El redactor tiene un máximo de dos intentos lógicos; el transporte conserva los reintentos y tiempos de espera del SDK existente.

El tono se orienta a ventas de petshop, con cercanía, respeto y un toque ligero cuando corresponde. No se simulan identidad humana, credenciales veterinarias ni acciones de terceros. Se mantiene precisión comercial y clínica aunque el cliente exprese una suposición incorrecta. No se fuerza humor ante una consulta clínica o urgente.

## Antes y después exactos

Antes, WhatsApp real, 20:23 UTC:

> No encuentro ZETAPRUEBAQ9 ZQ17 de 4kg en el catálogo actual. No la he agregado al pedido. ¿Puedes confirmar el nombre completo y la presentación para revisarlo?

Versión final, WhatsApp real, consulta ficticia después de reiniciar:

**Consulta inicial**, respuesta a las 2026-10-29T21:30:38.442218+00:00:

> No lo puedo confirmar con seguridad con esos datos. Si te interesa, puedo ayudarte a orientar la búsqueda por la necesidad que tengas; dime para qué tipo de producto es y te sigo.

**Seguimiento: «No tengo foto ni más datos, ese es el nombre y son 4 kilos»**, respuesta a las 2026-10-29T21:31:43.220596+00:00:

> Gracias, lo dejo registrado para revisión con la referencia y la presentación que indicaste. Por ahora no hay un asesor asignado en este chat ni se ha notificado a nadie, así que queda pendiente de revisión. Mientras tanto, puedo seguir ayudándote con cualquier otra consulta que tengas.

**Consulta real posterior al pendiente**, respuesta a las 2026-10-29T21:33:15.035307+00:00:

> DIAMOND INDOOR CAT de 500 g te queda en $19.500. Las existencias están por confirmar. 🙂

Estas son salidas reales; no se incorporaron como un banco de frases. El pendiente no fue presentado como asesor notificado o asignado. La falta de un canal humano real limita lo que puede prometerse al cliente y queda pendiente de implementación comercial.

## Pruebas y evidencia

Suite final: **1020 pruebas aprobadas, cero fallos**, aproximadamente 7,24 segundos. `git diff --check` sin incidencias. Incluye regresiones de carrito, checkout, deduplicación, concurrencia, aislamiento entre conversaciones, multimedia, derivación clínica y atención humana activa. Las nuevas pruebas cubren ocultar el resumen irrelevante, conservarlo en operaciones reales, no cerrar por falta de pistas, conservar la solicitud original y no anunciar revisión si falla su persistencia.

Las pruebas de clínica, operador activo, error de consulta y fallo de persistencia en esta ampliación fueron automatizadas; no se provocaron fallos de Supabase ni se contactó a un operador real para probarlos. La conversación real ya tenía una revisión clínica pendiente de una prueba anterior, que se conservó al añadir la comercial.

### WhatsApp Web → Kapso → webhook → agente → modelos/Supabase → Kapso

Primera fase de política comercial: `e2e-policy-final.json` y `e2e-policy-summary.json`, seis turnos entre 21:19 y 21:24 UTC:

- Identidad ficticia, con búsquedas y aclaraciones previas en el contexto: revisión pendiente honesta.
- Seguimiento sin foto ni más datos: sin nuevas peticiones de foto ni silencio.
- Nueva consulta Pro Plan UR: pregunta perro o gato.
- «Para perrito»: distingue concentrado y lata.
- «El concentrado, solo quiero saber el precio»: PRO PLAN CANINE UR 2kg, $122.000.
- Nueva referencia DIAMOND INDOOR CAT 500gr: $19.500, con existencias por confirmar.

La inspección del estado de esta fase encontró la pérdida de la descripción en el resumen del pendiente. Por eso no se dio por terminado el trabajo. Después de corregirla, ejecutar la suite y reiniciar únicamente el agente se repitieron tres turnos afectados: consulta ficticia, seguimiento sin datos y nueva consulta real. Evidencia final: `e2e-snapshot-final.json` y `e2e-snapshot-summary.json`.

| Turno final | Entrada persistida | Salida persistida | Entrada → salida persistida |
|---|---|---|---:|
| 1 | `466ff77d-36a3-9fed-4fb2-158ee843095c` | `3b0ed4b3-7524-305a-e6f7-15cc00d3d73e` | 31.802 s |
| 2 | `4d1cf2c7-617a-ec31-5aed-e159fda4ff8f` | `4587c740-83d1-b1fc-4fed-e6768f86baa6` | 34.358 s |
| 3 | `f7dc8e33-fb0f-9b53-0629-61586acbe2b0` | `1219458d-d6d0-2bc9-370e-309d0f573f79` | 28.619 s |

Los **9/9 salientes** de ambas fases tienen estado `delivered` en Kapso. Cada turno tiene una salida; cero claves de evento duplicadas, cero pedidos nuevos, carrito real vacío antes y después. Los hashes de mensajes del resumen permiten trazar la entrega sin publicar teléfonos. No se afirma garantía universal de entrega exactamente una vez.

Tiempos del pipeline, incluyendo el buffer existente: mediana **30.176 s**, rango **27.364–35.597 s** en nueve turnos. La repetición del código final tardó 33.232 s, 35.597 s, 30.176 s. No se observa una mejora de velocidad demostrable frente a la plantilla anterior; la generación añade trabajo y el contexto acumulado también afecta las llamadas. La muestra es pequeña y no es un SLA.

### Evaluaciones con estado en memoria

Durante las iteraciones se ejecutaron **28 turnos** de evaluación con modelos reales y lectura de Supabase, sin WhatsApp, pedidos ni persistencia remota de conversaciones. No son 28 aprobaciones del código final. Los archivos conservan también resultados fallidos que motivaron correcciones.

`final-commercial-policy.json` contiene cuatro turnos con un carrito precargado de BR CAT SALMON 1kg por $30.500: consulta informativa sin resumen, seguimiento que registra revisión comercial, recomendaciones autorizadas por necesidad y solicitud explícita del carrito. Los cuatro conservaron el carrito. El resumen apareció únicamente cuando se solicitó. Esta matriz precede a los últimos ajustes de redacción y snapshot; las rutas afectadas se repitieron por WhatsApp después de cargar el código final.

Los archivos `final-tone.json`, `final-verified.json`, `final-resources.json`, `final-scoped.json`, `final-controls.json` y `final-assistance.json` son evidencia histórica de iteraciones. Las respuestas «lo dejamos aquí» y los resúmenes irrelevantes presentes en esas versiones **no describen la política vigente**. La nueva instrucción del usuario de escalar también por incertidumbre comercial agotada reemplaza la política anterior de derivar automáticamente solo por clínica.

Una limitación de reconocimiento encontrada fue «diamon indor» con dos errores: no validó automáticamente el precio. Al aclarar DIAMOND INDOOR CAT, 500 gramos, sí cotizó $19.500 sin inventar stock. No se cambió el buscador ni se forzó un match para ocultar esa limitación.

### Contraste con catálogo real

`policy-catalog-evidence.json` registra lecturas independientes y acotadas al tenant:

| Referencia | ID | Presentación | Precio | Stock registrado |
|---|---|---|---:|---|
| PRO PLAN CANINE UR | `900230bf-4cf5-4522-afb6-739f0275909f` | 2kg | $122.000 | null |
| PRO PLAN CANINE LATA UR | `38fbf049-d4c4-43c4-aef2-a8da499d11fa` | unidad | $28.600 | null |
| DIAMOND INDOOR CAT | `1224f0d0-b4db-494b-8200-56c6e0dad19f` | 500gr | $19.500 | null |

Null significa existencias desconocidas. El precio de la lata se verificó como candidato; no fue seleccionado por el cliente de prueba. La cotización final del concentrado no afirma disponibilidad y Diamond conservó expresamente la advertencia de existencias.

## Archivos modificados por esta mejora

- `src/services/humanizer.js`: redacción contextual, validación del siguiente paso y de acciones, restricciones de aclaración, presentación de consulta y hechos reales de revisión pendiente.
- `src/services/productMatchValidator.js`: contingencias sin falsa ausencia ni repetición indiscriminada de atributos.
- `src/services/humanHandoffService.js`: revisión comercial persistida, continuidad del chat y snapshot original de la solicitud.
- `src/services/conversationService.js`: conexión de las rutas, persistencia antes de confirmar revisión, conservación de restricciones y separación del resumen de pedido.
- `src/utils/responsePresentation.js`: política de presentación según intención y operación, sin analizar frases literales del cliente.
- `src/services/aiInterpreter.js` y `src/services/aiContextOptimizer.js`: esquema y extracción semántica de recursos disponibles; actualización de la política de derivación.
- `test/productConversationFacts.test.js`, `test/productMatchValidator.test.js`, `test/contextualHandoff.test.js`: pruebas de estas decisiones y actualización de expectativas de la política anterior.
- `scripts/evaluation/recommendations-live.js`, `recommendations-observe.js` y `unresolved-policy-summary.js`: reproducción y evidencia de alcance separado.

No se modificó el modelo configurado ni se reconstruyó el flujo. Las etapas observadas usaron las configuraciones existentes gpt-5.4, gpt-5.2 y gpt-5.4-mini. No se alteraron catálogo, precios, SQL, esquema de Supabase, buffer ni lógica de checkout. Los cambios previos del proyecto se conservaron. Las pruebas E2E escribieron únicamente los mensajes/estados normales del Sandbox mediante el agente; no se crearon pedidos ni se contactó a clientes reales. No hubo publicación ni push.

## Estado operativo y pendiente humano

Comprobación final 2026-10-29T21:33:54.745Z: HTTP 200, `ok:true`, PID 15799, fuentes cargadas coincidentes con disco, sin fallos de telemetría ni excepciones registradas en ese arranque. Huella:

`65a1ff26f1d0e2b032ef870cda6ed8fe54a9fca5f97323673c342902d4dccea2`

El servidor se inició a las 2026-10-29T21:29:31.997Z en el directorio correcto. Corre en una sesión temporal de ejecución; no se instaló un servicio permanente ni se garantiza su supervivencia al cierre de esa sesión.

En Supabase se conservó el pendiente clínico previo y, dentro de él, `consultaComercialPendiente`. La repetición final verificó que `referenciaPendiente.mensaje` contiene la consulta original de ZetaPruebaQ9 ZQ17, `terminos` conserva ambas señales y `presentacion` es 4kg. No fue sustituida por «no tengo foto».

**No hay un canal humano efectivo configurado.** Estado real: `notificacion: no_configurada`, `asignacion: null`. La pregunta publicada sobre canal y asesor era de negocio, no una aprobación técnica; la herramienta devolvió solamente `accepted: true`, sin identificador, y no dispone de una operación de cancelación expuesta. No se requiere pulsar Take over para completar estas pruebas. Se difiere esa decisión y cualquier envío a terceros hasta que exista un destino definido y autorizado.

La denegación previa de control de la aplicación Terminal no se reintentó ni se eludió. Se usó la herramienta de shell autorizada para código, tests y reinicio del agente. El control se pausó mientras el usuario trabajaba en otro chat y se retomó solo después de que liberó el PC. No se enviaron mensajes inciertos por segunda vez: cada repetición corresponde a una prueba deliberada con un evento nuevo y se verificó su salida.

## Nota de versión

Esta actualización reemplaza el informe anterior en el mismo elemento de Library. Corrige el estado que antes indicaba E2E pendiente, documenta el resumen de carrito que no debió mostrarse en una consulta, añade la conservación de la solicitud inicial y aplica la nueva política comercial del usuario. Los resultados antiguos se conservan como evidencia de iteraciones, no como resultados de la versión vigente.
