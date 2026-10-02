# Selección de referencia base

El diálogo reportado se reprodujo con el catálogo local: tanto la consulta inicial
como `nexgard 10kg` devolvían ambigüedad entre la referencia base y Spectra.
El filtro de identidad completa exigía más de un token, por lo que excluía
nombres completos de una sola palabra y dejaba empatar variantes no solicitadas.

Se permite ahora cualquier identidad completa no vacía, conservando los filtros
de atributos y las referencias equivalentes. El prompt de petshop también explica
que repetir un nombre ofrecido selecciona esa referencia y conserva los datos
confirmados. No se añadieron nombres comerciales a la lógica.

El límite de 10 kg comunicado por el usuario se registra como dato comercial:
`metadata.rango_peso.desde_inclusivo: false` en la presentación NexGard 10–25 kg.
El selector genérico respeta extremos declarados; cuando no hay metadatos sigue
pidiendo aclaración ante límites compartidos. Esto evita extrapolar el límite
confirmado a otros productos. El dato se guardó también en Supabase, preservando
precio, códigos y demás metadatos, con lectura de verificación tras la actualización.

Las regresiones cubren el mensaje inicial, la respuesta a la elección pendiente,
la variante explícita, especies incompatibles y límites abiertos/cerrados. Se
repiten con nombres ficticios de una y varias palabras. En la conversación de
prueba se cotiza 4–10 kg, se elimina la aclaración y el carrito sigue vacío.

La prueba adicional del intérprete real fue bloqueada por revisión automática
debido al envío de catálogo y contexto a OpenAI; las pruebas conversacionales
usan un intérprete simulado. No se enviaron mensajes de WhatsApp. El proceso
local del sandbox se reinició para cargar los cambios.
