# Causa y alcance de evidencia

El turno original conservó ROYALCANIN GASTROINTESTINAL PERRO en la interpretación, pero la validación recibió el fragmento «de 2 kg, el mismo concentrado para perro». La continuación larga de una consulta ya identificada no activaba la recuperación de identidad. La segmentación literal pasó a ser evidencia de búsqueda y validación sin marca ni línea. Se conservaron candidatos ajenos y el redactor terminó preguntando por TASTE OF THE WILD ADULT PERRO en 2 kg, aunque ese candidato solo tenía 1 kg y 2.2 kg.

La primera presencia conservada de la marca ajena está en el estado de candidatos posterior al matching. No se guardó el cuerpo SQL original ni todas las entradas/salidas originales del modelo; no afirmamos conocer el primer token de aparición dentro de esa llamada. La procedencia comprobada es un candidato del catálogo, no una marca mencionada por el cliente. La reconstrucción determinista se distingue de las trazas originales. El primer borrador fue rechazado por precio no confirmado; su texto original no quedó guardado.

Cambios generales: recuperar la identidad estructurada vigente al corregir peso, formato o cantidad en consultas compatibles; conservar marca/línea/especie y descartar peso antiguo si cambia el formato; normalizar únicamente espacios en marca y atributos redundantes; validar otra vez contra catálogo; rechazar en el redactor pesos no registrados por el candidato. No se bajaron umbrales ni se añadieron marcas a reglas.

Durante la nueva validación apareció otra pérdida demostrada: ambos mensajes entraron al buffer, pero la segmentación seleccionó solo «Pro Plan UR para perro» y eliminó «el concentrado de 2 kg». El router había leído el mensaje completo. Ahora una mención segmentada se rechaza si elimina forma, envase o peso explícitos del conjunto. Se usa entonces la entrada completa.

Los controles locales reservados usan otras marcas sintéticas y extracción simulada; no son visión ni comprensión integral real. Las trazas adicionales están desactivadas por defecto y solo habilitadas en el proceso de pruebas. La corrección no añade llamadas a modelos; conserva el buffer de 5 segundos. Las latencias observadas se reportan por separado y no prueban igualdad estadística de velocidad.

Otra ruta demostrada: al cambiar a lata, la continuidad ya estaba reconstruida, pero resolverSeleccionProductoPendiente reutilizaba la cotización seca porque el formato nuevo carecía deliberadamente de peso. La prueba completa sintética reprodujo ese fallo antes del ajuste. Las correcciones de atributos ahora pasan directamente a validación nueva. Un borrador incorrecto de lata con precio seco fue rechazado; la respuesta final de esa pasada aún volvió al concentrado y se conserva como fallo.

La interpretación de diminutivos conserva por separado especie y etapa: gatito indica gato, sin borrar el token comercial que diferencia una línea joven de la adulta. Una regresión intermedia de visión simulada detectó esa diferencia y fue corregida antes de cargar la versión final.

El control local de cantidad inspecciona la cantidad entregada al redactor simulado, no exige que ese mock produzca un total. El importe total debe comprobarse con el redactor real en Sandbox.
