# Continuidad comercial con consulta clínica pendiente

Actualización autorizada por el usuario el 28 de octubre de 2026: continuar consultas comerciales, comportarse como asesor experto de petshop/veterinaria y resolverlo de forma general, sin memorizar frases ni productos.

## Resultado local

La condición que antes devolvía `null` para cualquier atención humana activa ahora distingue el alcance:

| Estado persistido | Comportamiento |
| --- | --- |
| `pendiente` + `criterio_veterinario` | Pasa por multimedia, contexto y router existentes. Atiende precio, disponibilidad, cotización, compra y cierre de pedido. Conserva la consulta clínica pendiente. |
| `en_atencion`, cualquiera que sea el motivo | Conserva pausa total para no interrumpir al operador. |
| `pendiente` + `solicitud_asesor` o `producto_no_resuelto` | Conserva pausa total. |
| Solicitud explícita de asesor durante pendiente clínica | Pasa a pausa total y conserva el antecedente clínico en `consultaClinicaPendiente` dentro del estado JSON. |

Un turno exclusivamente clínico obtiene la indicación de necesidad de asesor y no ejecuta acciones de producto. Una petición mixta puede atender la parte comercial independiente sin resolver ni responder la pregunta clínica. Se conserva un aviso breve en la respuesta y en el historial, sin prometer asignación o notificación real.

El mensaje original de Pro Plan UR ahora alcanza la búsqueda y obtiene una cotización en la reproducción offline con catálogo sintético. El ID original ya está procesado y no se reenvía ni se modifica retrospectivamente.

## Política general

- Se reutiliza el router semántico actual. No se agregó otro clasificador ni una llamada extra al modelo para decidir la excepción.
- `solicitudComercialIndependiente` es un booleano del contrato normalizado. Para una petición mixta se exige también una acción comercial estructurada: consulta de catálogo o continuación del flujo.
- El prompt distingue la petición actual de antecedentes de salud, receta o selección previa. Cotizar un producto elegido por el cliente no equivale a elegir un tratamiento.
- Los campos de producto, carrito, entrega y datos del turno mixto describen únicamente la parte comercial independiente.
- La información y recomendaciones comerciales se limitan a atributos comprobados del catálogo. El rol experto del sector no autoriza inventar beneficios, diagnósticos, tratamientos ni dosis personalizadas.
- No se añadieron expresiones regulares, listas de frases, marcas, referencias ni equivalencias de ejemplo para decidir la ruta. Los nombres del incidente y las referencias sintéticas solo aparecen en pruebas/documentación. El aviso clínico fijo comunica el estado; no clasifica mensajes.

## Archivos de esta actualización

- `src/services/humanHandoffService.js`: alcance de la pausa, validación de petición mixta, preservación del antecedente clínico ante takeover explícito y aviso breve.
- `src/services/conversationService.js`: abre únicamente el pendiente clínico al flujo normal; guarda la derivación antes de ejecutar la parte comercial mixta; mantiene el mismo aviso en respuesta e historial con contexto aislado por turno.
- `src/services/aiInterpreter.js`: normaliza el booleano nuevo sin coerción de strings/números.
- `src/services/aiContextOptimizer.js`: instrucciones generales del router y humanizador; aporta estado/motivo de atención al router. Se verificó que la compresión conserve las reglas de tono anteriores.
- `src/verticals/petshop/prompt.js`: papel de asesor comercial experto en petshop y veterinaria.
- `test/contextualHandoff.test.js`: nuevas regresiones y actualización de las expectativas anteriores que exigían silencio comercial durante pendiente clínica.

Los cambios anteriores de observabilidad siguen presentes. Se conservaron las modificaciones previas de checkout. No cambiaron modelos, configuración `.env`, catálogo, proveedor Kapso, buffer, reglas de carrito ni estructura de tablas. La persistencia utiliza el campo JSON `state` existente, sin migración.

## Validación

Baseline anterior: **950/950**. Suite final: **973/973**, sin fallos, canceladas u omitidas. Pruebas específicas de handoff: **39/39**. `git diff --check` limpio.

Casos cubiertos:

- Estado heredado del incidente, con dos variantes: pendiente clínico responde comercialmente; operador en atención mantiene pausa.
- Consulta clínica sola; mezcla clínica + precio; mezcla clínica + compra explícita; ausencia de acción comercial independiente.
- Cotización con vocabulario veterinario, contexto de receta, paráfrasis y errores de escritura en fixtures sintéticos.
- Aceptación elíptica de una selección cotizada tras recrear el motor.
- Imagen y audio mediante el procesamiento multimedia existente, con resultados de visión/transcripción simulados.
- Compra, datos completos, confirmación de pedido y reentrega del mismo ID sin duplicar el carrito ni el cierre.
- Buffer y motor juntos: ráfaga con dos mensajes y reentrega produce una sola respuesta; un mensaje que llega durante el procesamiento sustituye el borrador anterior y permite responder al lote vigente.
- Dos empresas con el mismo usuario, operador activo y aislamiento de avisos clínicos concurrentes.
- Fallo de persistencia de la derivación mixta antes de cualquier acción comercial.
- Contrato normalizado y presencia de reglas de dominio/tono en los prompts realmente construidos.

Resultados: [tests.commercial.txt](tests.commercial.txt). Baseline de 950 pruebas: [tests.after.txt](tests.after.txt).

## Ejemplos de comportamiento comprobado

- Antecedentes clínicos + pregunta por el precio de una referencia explícita → consulta el catálogo y devuelve el precio del fixture, conservando el pendiente clínico y el carrito.
- Pregunta de tratamiento + cotización independiente → cotiza y añade: «La orientación clínica sigue pendiente de un asesor; puedo ayudarte con la información comercial y tu pedido.»
- Aceptación breve del producto ya cotizado → incorpora esa selección al pedido; no exige repetir el nombre por existir derivación clínica.
- Datos de entrega completos + pago → muestra el resumen; una confirmación explícita posterior completa el pedido, conservando el pendiente clínico.
- Petición de hablar con una persona → pausa total; no sigue respondiendo cotizaciones automáticamente.

Los precios y productos sintéticos de las pruebas no representan precios vigentes del negocio.

## Estado de ejecución y límites

Implementado **solo en disco**. No se reinició, desplegó ni hizo push. No se enviaron mensajes, no hubo escrituras productivas ni pruebas pagadas contra OpenAI. El proceso Node iniciado antes de estos cambios sigue con el código cargado anteriormente hasta que se autorice su actualización.

Las pruebas simulan las decisiones estructuradas del modelo y los servicios externos. Demuestran enrutamiento, persistencia simulada y efectos del motor; no prueban que el modelo real interprete correctamente toda paráfrasis, imagen o audio. Falta validar una prueba E2E limitada en Sandbox con autorización y después de cargar el código.

Se mantiene el límite de la arquitectura descrito en el informe inicial: no se promete entrega exactamente una vez ni se reintentan envíos ambiguos a ciegas. Tampoco se construyó un panel de asesores.
