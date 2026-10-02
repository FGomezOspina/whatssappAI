-- Restauración propuesta para distrifinca. NO se ejecutó automáticamente.
-- Fuente: productos.json. 94 presentaciones ausentes en la consulta actual.
-- Solo INSERT; no cambia filas existentes, marcas, referencias ni lógica.
-- Genera nuevos IDs y fechas. stock NULL significa desconocido en el JSON.
BEGIN;
CREATE TEMP TABLE restore_presentations_candidates ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset($recovery$[
  {
    "reference_id": "2c26a2b8-fc1c-4739-828a-fa65c491ac28",
    "brand": "AGILITY",
    "reference": "AGILITY GATITO",
    "weight": "3kg",
    "price": 86700,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 1,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301010023",
      "llave": "23",
      "nombre_original": "AGILITY GATITO 3KG",
      "codigos": [
        "10301010023"
      ]
    }
  },
  {
    "reference_id": "45e6e44b-0312-4f3f-9761-0e384331e7a7",
    "brand": "AGILITY",
    "reference": "AGILITY GRAN ADUL",
    "weight": "15kg",
    "price": 278900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "103010101943",
      "llave": "1943",
      "nombre_original": "AGILITY GRAN ADUL 15KG",
      "codigos": [
        "103010101943"
      ]
    }
  },
  {
    "reference_id": "4128b96d-b89a-4189-a9f3-cac359cd35e4",
    "brand": "AGILITY",
    "reference": "AGILITY GRAND CACH",
    "weight": "1.5kg",
    "price": 33700,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "nombre_original": "AGILITY GRANDES CACHORROS 1.5KG"
    }
  },
  {
    "reference_id": "5a36b2fa-9f48-422f-abdd-521cb0aa1b08",
    "brand": "ALPISTE",
    "reference": "ALPISTE",
    "weight": "400gr",
    "price": 2800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301030058",
      "llave": "58",
      "nombre_original": "ALPISTE 400GR",
      "codigos": [
        "10301030058"
      ]
    }
  },
  {
    "reference_id": "83960497-178e-4040-9dd3-659cafc3a585",
    "brand": "ALPO",
    "reference": "ALPO ADUL",
    "weight": "x 2kg",
    "price": 16900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301020390",
      "llave": "390",
      "nombre_original": "ALPO ADUL X 2KG",
      "codigos": [
        "10301020390"
      ]
    }
  },
  {
    "reference_id": "3eb33358-039f-4573-94c5-b1e3ac8b58e1",
    "brand": "APOQUEL",
    "reference": "APOQUEL",
    "weight": "3.6mg",
    "price": 9000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 1,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010067",
      "llave": "67",
      "nombre_original": "APOQUEL 3.6MG",
      "codigos": [
        "10101010067"
      ]
    }
  },
  {
    "reference_id": "bf0fe92a-7bee-4c7a-9365-e43feebe8e35",
    "brand": "ARENA",
    "reference": "ARENA FOFICAT",
    "weight": "5kg",
    "price": 19000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10201010070",
      "llave": "70",
      "nombre_original": "ARENA FOFICAT 5KG",
      "codigos": [
        "10201010070"
      ]
    }
  },
  {
    "reference_id": "30a5e872-42cf-41f9-996e-dc7860272fe5",
    "brand": "ARENA",
    "reference": "ARENA MIRRINGO",
    "weight": "x 5 kg",
    "price": 26900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 1,
    "metadata": {
      "source": "productos.json",
      "codigo": "10201010088",
      "llave": "88",
      "nombre_original": "ARENA MIRRINGO X 5 kl",
      "codigos": [
        "10201010088"
      ]
    }
  },
  {
    "reference_id": "50cd6907-ed6b-4780-93ea-70393e955e26",
    "brand": "ARENA KITTEN ORIGINAL",
    "reference": "ARENA KITTEN ORIGINAL",
    "weight": "8kg",
    "price": 23800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 2,
    "metadata": {
      "source": "productos.json",
      "codigo": "110010101775",
      "llave": "1775",
      "nombre_original": "ARENA KITTEN ORIGINAL 8KL",
      "codigos": [
        "110010101775"
      ]
    }
  },
  {
    "reference_id": "906dcade-aa4e-4c7b-b652-978353832387",
    "brand": "ARENA MAIZ CAT",
    "reference": "ARENA MAIZ CAT",
    "weight": "x 15kg",
    "price": 61500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 1,
    "metadata": {
      "source": "productos.json",
      "codigo": "10201010092",
      "llave": "92",
      "nombre_original": "ARENA MAIZ CAT X 15KG",
      "codigos": [
        "10201010092"
      ]
    }
  },
  {
    "reference_id": "9928848c-f9c2-4021-8df1-fa31d3834eff",
    "brand": "ARNES",
    "reference": "ARNES ANTITIRONES L",
    "weight": "unidad",
    "price": 31000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "106010101784",
      "llave": "1784",
      "nombre_original": "ARNES ANTITIRONES L",
      "codigos": [
        "106010101784"
      ]
    }
  },
  {
    "reference_id": "acb2d86b-3581-4668-8e4d-4d8e0cfd659b",
    "brand": "ARTRIBALANCE",
    "reference": "ARTRIBALANCE",
    "weight": "tableta",
    "price": 2800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010123",
      "llave": "123",
      "nombre_original": "ARTRIBALANCE TAB",
      "codigos": [
        "10101010123"
      ]
    }
  },
  {
    "reference_id": "945d4c9e-61ee-440f-9092-f61204336063",
    "brand": "BR DOG",
    "reference": "BR DOG VET RENAL",
    "weight": "x 2kg",
    "price": 103000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "103010102487",
      "llave": "2487",
      "nombre_original": "BR DOG VET RENAL X 2KG",
      "codigos": [
        "103010102487"
      ]
    }
  },
  {
    "reference_id": "07b21de7-fbfc-451f-9772-6f8f2114095a",
    "brand": "C-THYRO-TABS",
    "reference": "C-THYRO-TABS",
    "weight": "0.5mg",
    "price": 1000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "101010101753",
      "llave": "1753",
      "nombre_original": "C-THYRO-TABS 0.5MG",
      "codigos": [
        "101010101753"
      ]
    }
  },
  {
    "reference_id": "3edde301-3beb-4e69-a71c-cb08f6391332",
    "brand": "CABANOS",
    "reference": "CABANOS KILO SURTIDO APRO 140",
    "weight": "unidad",
    "price": 16000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10501011256",
      "llave": "1256",
      "nombre_original": "CABANOS KILO SURTIDO APRO 140",
      "codigos": [
        "10501011256"
      ]
    }
  },
  {
    "reference_id": "b28787d4-c47a-466c-8c59-6f4ae33fe2ff",
    "brand": "CAMA",
    "reference": "CAMA COLCHONETA L",
    "weight": "unidad",
    "price": 65000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601010924",
      "llave": "924",
      "nombre_original": "CAMA COLCHONETA L",
      "codigos": [
        "10601010924"
      ]
    }
  },
  {
    "reference_id": "3b9afbef-8c8c-4fe9-8167-da74f685eb08",
    "brand": "CANIPETS",
    "reference": "CANIPETS",
    "weight": "10ml",
    "price": 14000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "101010102159",
      "llave": "2159",
      "nombre_original": "CANIPETS 10ML",
      "codigos": [
        "101010102159"
      ]
    }
  },
  {
    "reference_id": "93ccd25f-765b-49cf-84f5-14a157d5429c",
    "brand": "CANIPETS",
    "reference": "CANIPETS PUPPY",
    "weight": "2ml",
    "price": 6900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "101010102162",
      "llave": "2162",
      "nombre_original": "CANIPETS PUPPY 2ML",
      "codigos": [
        "101010102162"
      ]
    }
  },
  {
    "reference_id": "eeaba178-da68-4f65-8d5b-790f6d77f8d6",
    "brand": "CAT CHOW",
    "reference": "CAT CHOW VIDA SANA 1.3 PAG",
    "weight": "1 l",
    "price": 31300,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301020332",
      "llave": "332",
      "nombre_original": "CAT CHOW VIDA SANA 1.3 PAG 1 LLEV 1.3",
      "codigos": [
        "10301020332"
      ]
    }
  },
  {
    "reference_id": "64739335-e698-4f5d-92d3-d445f524d591",
    "brand": "CHUNKY",
    "reference": "CHUNKY DELIDOG BONE",
    "weight": "170gr",
    "price": 8600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "105010102076",
      "llave": "2076",
      "nombre_original": "CHUNKY DELIDOG BONE 170GR",
      "codigos": [
        "105010102076"
      ]
    }
  },
  {
    "reference_id": "03dee5c1-8246-401f-a0a1-45730260d3a2",
    "brand": "CHUNKY",
    "reference": "CHUNKY DELIGO POUCH PAG",
    "weight": "3 l",
    "price": 10100,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "104010102016",
      "llave": "2016",
      "nombre_original": "CHUNKY DELIGO POUCH PAG 3 LLEV 4",
      "codigos": [
        "104010102016"
      ]
    }
  },
  {
    "reference_id": "e2b1ca02-624c-49bb-8ed0-375b4a1fa938",
    "brand": "CIPACAT",
    "reference": "CIPACAT",
    "weight": "500gr",
    "price": 4100,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301020406",
      "llave": "406",
      "nombre_original": "CIPACAT 500GR",
      "codigos": [
        "10301020406"
      ]
    }
  },
  {
    "reference_id": "1d4ee500-b52d-4771-9a8e-570262ce9426",
    "brand": "COMPLELAND",
    "reference": "COMPLELAND B12 O",
    "weight": "100ml",
    "price": 10500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010490",
      "llave": "490",
      "nombre_original": "COMPLELAND B12 O100ML",
      "codigos": [
        "10101010490"
      ]
    }
  },
  {
    "reference_id": "7588a6df-a605-494b-b8ac-6042a08a4f63",
    "brand": "CORRAL",
    "reference": "CORRAL PLEGABLE",
    "weight": "unidad",
    "price": 65000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601010922",
      "llave": "922",
      "nombre_original": "CORRAL PLEGABLE",
      "codigos": [
        "10601010922"
      ]
    }
  },
  {
    "reference_id": "22e8126a-d79e-48eb-bccc-2c0037d24666",
    "brand": "CORTA",
    "reference": "CORTA UÑAS L",
    "weight": "unidad",
    "price": 9600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "106010101925",
      "llave": "1925",
      "nombre_original": "CORTA UÑAS L",
      "codigos": [
        "106010101925"
      ]
    }
  },
  {
    "reference_id": "a37b59f9-39b8-4bc7-ae8b-373ea6b1e46d",
    "brand": "CREDELIO",
    "reference": "CREDELIO PLUS 1.4KG A 2.8KG",
    "weight": "56.25mg",
    "price": 35900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301010961",
      "llave": "961",
      "nombre_original": "CREDELIO PLUS 1.4KG A 2.8KG 56.25MG",
      "codigos": [
        "10301010961"
      ]
    }
  },
  {
    "reference_id": "7a87b810-9fab-419d-83bc-4fb6298779fb",
    "brand": "DERMOSYN",
    "reference": "DERMOSYN",
    "weight": "100ml",
    "price": 39000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010545",
      "llave": "545",
      "nombre_original": "DERMOSYN 100ML",
      "codigos": [
        "10101010545"
      ]
    }
  },
  {
    "reference_id": "1224f0d0-b4db-494b-8200-56c6e0dad19f",
    "brand": "DIAMOND",
    "reference": "DIAMOND INDOOR CAT",
    "weight": "500gr",
    "price": 19500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301020553",
      "llave": "553",
      "nombre_original": "DIAMOND INDOOR CAT 500GR",
      "codigos": [
        "10301020553"
      ]
    }
  },
  {
    "reference_id": "1bc3e0d3-b2b5-4848-b8ec-ef8a18949ea1",
    "brand": "DOG CHOW",
    "reference": "DOG CHOW C RP",
    "weight": "x 1kg",
    "price": 15700,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301010584",
      "llave": "584",
      "nombre_original": "DOG CHOW C RP X 1KL",
      "codigos": [
        "10301010584"
      ]
    }
  },
  {
    "reference_id": "0552e1d4-e6a7-48b9-ae5f-07637ae82179",
    "brand": "DOG CHOW",
    "reference": "DOG CHOW POUCH PAG",
    "weight": "6l",
    "price": 19200,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301010557",
      "llave": "557",
      "nombre_original": "DOG CHOW POUCH PAG 6LLEV7",
      "codigos": [
        "10301010557"
      ]
    }
  },
  {
    "reference_id": "473a9bab-0fc6-4d66-b5c4-9707c4a2884c",
    "brand": "DOG CHOW",
    "reference": "DOG CHOW POUCHE CACH",
    "weight": "x 100 gr",
    "price": 3200,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301010605",
      "llave": "605",
      "nombre_original": "DOG CHOW POUCHE CACH X 100 GR",
      "codigos": [
        "10301010605"
      ]
    }
  },
  {
    "reference_id": "42b2179b-7b0a-4693-b819-6fef19bea90d",
    "brand": "DOGG",
    "reference": "DOGG MA",
    "weight": "x 10 ml",
    "price": 20800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010615",
      "llave": "615",
      "nombre_original": "DOGG MAX 10 ML",
      "codigos": [
        "10101010615"
      ]
    }
  },
  {
    "reference_id": "93d7d6cd-40f0-4676-b57f-7dc519bee725",
    "brand": "DOGOURMET",
    "reference": "DOGOURMET PARRILLA",
    "weight": "x 2 kg",
    "price": 21600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 1,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301010631",
      "llave": "631",
      "nombre_original": "DOGOURMET PARRILLA X 2 KL",
      "codigos": [
        "10301010631"
      ]
    }
  },
  {
    "reference_id": "cface178-82ee-4cf3-b25d-ef396830670e",
    "brand": "DOGOURMET",
    "reference": "DOGOURMET PAVO POLLO",
    "weight": "8 kg",
    "price": 79400,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 2,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301010637",
      "llave": "637",
      "nombre_original": "DOGOURMET PAVO POLLO 8 KL",
      "codigos": [
        "10301010637"
      ]
    }
  },
  {
    "reference_id": "d8486af1-2065-4c2d-8290-5d4bdf43a685",
    "brand": "DOGOURMET",
    "reference": "DOGOURMET SALMON",
    "weight": "x 8kg",
    "price": 79400,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "103010102115",
      "llave": "2115",
      "nombre_original": "DOGOURMET SALMON X 8KG",
      "codigos": [
        "103010102115"
      ]
    }
  },
  {
    "reference_id": "94a5f184-86d6-4fc5-bf17-11e00e397468",
    "brand": "DONKAN",
    "reference": "DONKAN",
    "weight": "x 12",
    "price": 61500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301010648",
      "llave": "648",
      "nombre_original": "DONKAN X 12 CARNE",
      "codigos": [
        "10301010648"
      ]
    }
  },
  {
    "reference_id": "068443b9-64d2-42da-af44-333211f04a9c",
    "brand": "ENDOGARD",
    "reference": "ENDOGARD 30 X UND",
    "weight": "unidad",
    "price": 27900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010669",
      "llave": "669",
      "nombre_original": "ENDOGARD 30 x UND",
      "codigos": [
        "10101010669"
      ]
    }
  },
  {
    "reference_id": "2f8a103c-9124-4931-9e3a-865f3fd2d0fa",
    "brand": "FAJA",
    "reference": "FAJA POST TALLA 2XL",
    "weight": "unidad",
    "price": 35000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601010435",
      "llave": "435",
      "nombre_original": "FAJA POST TALLA 2XL",
      "codigos": [
        "10601010435"
      ]
    }
  },
  {
    "reference_id": "0080b53d-d0df-453d-98a9-c766f65a3c93",
    "brand": "FAJA",
    "reference": "FAJA XL (DE",
    "weight": "18 a 22kg",
    "price": 72500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "106010102419",
      "llave": "2419",
      "nombre_original": "FAJA XL (DE18 A 22KG)",
      "codigos": [
        "106010102419"
      ]
    }
  },
  {
    "reference_id": "909adf9c-37f9-408d-8c50-c5221f62554a",
    "brand": "FAJA",
    "reference": "FAJA XXS (DE",
    "weight": "2 a 3kg",
    "price": 44900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601010718",
      "llave": "718",
      "nombre_original": "FAJA XXS (DE 2 A 3KG)",
      "codigos": [
        "10601010718"
      ]
    }
  },
  {
    "reference_id": "6bd1272c-2da4-44e6-a851-6bae1c31d2ab",
    "brand": "FELIX",
    "reference": "FELIX PATE PESC ATUN",
    "weight": "156gr",
    "price": 5200,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301020737",
      "llave": "737",
      "nombre_original": "FELIX PATE PESC ATUN 156GR",
      "codigos": [
        "10301020737"
      ]
    }
  },
  {
    "reference_id": "be85db08-6c6e-49b7-9398-f44abb05bd31",
    "brand": "FREEMIAU",
    "reference": "FREEMIAU CITRICA",
    "weight": "x 4 kg",
    "price": 16900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10201010076",
      "llave": "76",
      "nombre_original": "FREEMIAU CITRICA X 4 KL",
      "codigos": [
        "10201010076"
      ]
    }
  },
  {
    "reference_id": "16f91e10-7310-4ad8-bfbd-a1a4cb545a5f",
    "brand": "GALLETAS",
    "reference": "GALLETAS ADORE CAT",
    "weight": "x 80",
    "price": 7100,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10501010306",
      "llave": "306",
      "nombre_original": "GALLETAS ADORE CAT X 80",
      "codigos": [
        "10501010306"
      ]
    }
  },
  {
    "reference_id": "cabfae3f-71c3-4811-a1a7-89d651efe12e",
    "brand": "GALLIPRANT",
    "reference": "GALLIPRANT",
    "weight": "x 20mg",
    "price": 4400,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "101010101894",
      "llave": "1894",
      "nombre_original": "GALLIPRANT X 20MG",
      "codigos": [
        "101010101894"
      ]
    }
  },
  {
    "reference_id": "d8233f7e-e233-4676-af62-3511bd08c600",
    "brand": "GIRASOL",
    "reference": "GIRASOL",
    "weight": "x 500gr",
    "price": 4000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 2,
    "metadata": {
      "source": "productos.json",
      "codigo": "109090901730",
      "llave": "1730",
      "nombre_original": "GIRASOL X 500GR",
      "codigos": [
        "109090901730"
      ]
    }
  },
  {
    "reference_id": "bfc5490a-3be2-4459-a284-94cfe3df9ffa",
    "brand": "GUANTE",
    "reference": "GUANTE PARA CEPILLAR Y MASAJE",
    "weight": "unidad",
    "price": 8500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601010107",
      "llave": "107",
      "nombre_original": "GUANTE PARA CEPILLAR Y MASAJE",
      "codigos": [
        "10601010107"
      ]
    }
  },
  {
    "reference_id": "c5e6012b-c384-463d-bc4f-591ab80fcf6e",
    "brand": "HEEL",
    "reference": "HEEL ENGYSTOL UND",
    "weight": "tableta",
    "price": 1800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010671",
      "llave": "671",
      "nombre_original": "HEEL ENGYSTOL TAB UND",
      "codigos": [
        "10101010671"
      ]
    }
  },
  {
    "reference_id": "1e59e2d3-6e20-4b20-b855-e2a600d086fb",
    "brand": "HILLS",
    "reference": "HILLS FEL LATA I/D",
    "weight": "5.5oz",
    "price": 17300,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10401010867",
      "llave": "867",
      "nombre_original": "HILLS FEL LATA I/D 5.5oz",
      "codigos": [
        "10401010867"
      ]
    }
  },
  {
    "reference_id": "3634b462-98bf-4fc9-93db-59c09f808488",
    "brand": "JABON",
    "reference": "JABON VETRIDERM",
    "weight": "unidad",
    "price": 22500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10201010918",
      "llave": "918",
      "nombre_original": "JABON VETRIDERM",
      "codigos": [
        "10201010918"
      ]
    }
  },
  {
    "reference_id": "99efb21c-3a6e-4412-824c-092dc2ccc522",
    "brand": "JUGUETE",
    "reference": "JUGUETE MASCOTAS EDG-175",
    "weight": "unidad",
    "price": 13500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "106010102137",
      "llave": "2137",
      "nombre_original": "JUGUETE MASCOTAS EDG-175",
      "codigos": [
        "106010102137"
      ]
    }
  },
  {
    "reference_id": "d869b81d-e74f-4e9a-b50a-547da2a82d82",
    "brand": "JUGUETE",
    "reference": "JUGUETE ORUGA MOVIMIENTO",
    "weight": "unidad",
    "price": 4500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10501011292",
      "llave": "1292",
      "nombre_original": "JUGUETE ORUGA MOVIMIENTO",
      "codigos": [
        "10501011292"
      ]
    }
  },
  {
    "reference_id": "6502b21f-6989-4b29-b785-74ea5682514c",
    "brand": "JUGUETE",
    "reference": "JUGUETE HUESO CHILLON",
    "weight": "unidad",
    "price": 10900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "106010102421",
      "llave": "2421",
      "nombre_original": "JUGUETE HUESO CHILLON",
      "codigos": [
        "106010102421"
      ]
    }
  },
  {
    "reference_id": "67bb1970-abaf-4e22-a3aa-f4e210fda948",
    "brand": "KILTIX",
    "reference": "KILTIX GRAN 66CM",
    "weight": "unidad",
    "price": 60000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010955",
      "llave": "955",
      "nombre_original": "KILTIX GRAN 66CM",
      "codigos": [
        "10101010955"
      ]
    }
  },
  {
    "reference_id": "90f90977-3e7d-4a13-b4ff-8927ff7078d9",
    "brand": "KITEKAT",
    "reference": "KITEKAT POUCH",
    "weight": "x 70gr",
    "price": 2200,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301020956",
      "llave": "956",
      "nombre_original": "KITEKAT POUCH X 70GR",
      "codigos": [
        "10301020956"
      ]
    }
  },
  {
    "reference_id": "63b246f6-745a-473d-8830-b74fc6c6dfd7",
    "brand": "LEVOTIROXINA",
    "reference": "LEVOTIROXINA",
    "weight": "0.4mg",
    "price": 1100,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "101010102336",
      "llave": "2336",
      "nombre_original": "LEVOTIROXINA 0.4MG X 100TAB",
      "codigos": [
        "101010102336"
      ]
    }
  },
  {
    "reference_id": "373b796e-9c9e-4f38-ba5f-1955ffaf3d96",
    "brand": "LHA",
    "reference": "LHA DIGEST-V",
    "weight": "200gr",
    "price": 82800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010984",
      "llave": "984",
      "nombre_original": "LHA DIGEST-V-200GR",
      "codigos": [
        "10101010984"
      ]
    }
  },
  {
    "reference_id": "35323691-fa26-490c-8c94-d52421891759",
    "brand": "LHA",
    "reference": "LHA RINOM-V",
    "weight": "x100gr",
    "price": 67000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101010996",
      "llave": "996",
      "nombre_original": "LHA RINOM-VX100GR",
      "codigos": [
        "10101010996"
      ]
    }
  },
  {
    "reference_id": "466d365f-12a8-41c1-8398-4794739688ab",
    "brand": "MIRRINGO",
    "reference": "MIRRINGO GATITO",
    "weight": "x 1kg",
    "price": 10800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301021061",
      "llave": "1061",
      "nombre_original": "MIRRINGO GATITO X 1KL",
      "codigos": [
        "10301021061"
      ]
    }
  },
  {
    "reference_id": "fc8847c0-e376-4c2f-98c4-e2c384f6c3f6",
    "brand": "MONELLO",
    "reference": "MONELLO CAT CASTRADOS",
    "weight": "x 1 kg",
    "price": 26600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301011066",
      "llave": "1066",
      "nombre_original": "MONELLO CAT CASTRADOS X 1 KL",
      "codigos": [
        "10301011066"
      ]
    }
  },
  {
    "reference_id": "b27908b3-e9e8-437c-a53e-674cb3bc5d34",
    "brand": "MORRAL",
    "reference": "MORRAL TRANSPARENTE",
    "weight": "unidad",
    "price": 101000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601010908",
      "llave": "908",
      "nombre_original": "MORRAL TRANSPARENTE",
      "codigos": [
        "10601010908"
      ]
    }
  },
  {
    "reference_id": "6db87782-9f4c-4d23-8afb-b5919437e138",
    "brand": "NATURAL",
    "reference": "NATURAL FRESHLY DERMA CLEAN BALSAMO",
    "weight": "x 56gr",
    "price": 39900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011091",
      "llave": "1091",
      "nombre_original": "NATURAL FRESHLY DERMA CLEAN BALSAMO X 56GR",
      "codigos": [
        "10101011091"
      ]
    }
  },
  {
    "reference_id": "8aded49f-3e19-4921-b743-7c059cae873f",
    "brand": "NATURAL",
    "reference": "NATURAL FRESHLY NO MUERDA",
    "weight": "x 240ml",
    "price": 25900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "101010102187",
      "llave": "2187",
      "nombre_original": "NATURAL FRESHLY NO MUERDA X 240ML SPRAY",
      "codigos": [
        "101010102187"
      ]
    }
  },
  {
    "reference_id": "d149e6fe-f37a-4361-8091-4b361b54abf4",
    "brand": "NUPEC",
    "reference": "NUPEC RELA",
    "weight": "x 180gr",
    "price": 36900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10501011586",
      "llave": "1586",
      "nombre_original": "NUPEC RELAX 180GR",
      "codigos": [
        "10501011586"
      ]
    }
  },
  {
    "reference_id": "6e8117c4-a3fe-4f2e-b20d-9022798a6bea",
    "brand": "NUTRA NUGGETS",
    "reference": "NUTRA NUGGETS LITE SENIOR",
    "weight": "x 1kg",
    "price": 25800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 1,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301011144",
      "llave": "1144",
      "nombre_original": "NUTRA NUGGETS LITE SENIOR X 1KL",
      "codigos": [
        "10301011144"
      ]
    }
  },
  {
    "reference_id": "e1affe6a-7c80-4ae6-948c-cf06794dfa8b",
    "brand": "NUTRECAN",
    "reference": "NUTRECAN ADULTO RP",
    "weight": "800 gr",
    "price": 10000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 2,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301011157",
      "llave": "1157",
      "nombre_original": "NUTRECAN ADULTO RP 800 GR",
      "codigos": [
        "10301011157"
      ]
    }
  },
  {
    "reference_id": "e5cb5f6e-9c87-42bc-af5d-354ee5e77704",
    "brand": "NUTRIBAR",
    "reference": "NUTRIBAR X UNIAD",
    "weight": "unidad",
    "price": 3200,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "105010102263",
      "llave": "2263",
      "nombre_original": "NUTRIBAR X UNIAD",
      "codigos": [
        "105010102263"
      ]
    }
  },
  {
    "reference_id": "39a46959-5a73-49bc-8ddf-9a88e29672a4",
    "brand": "OFTAPROC",
    "reference": "OFTAPROC M",
    "weight": "x 10 ml",
    "price": 115900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011214",
      "llave": "1214",
      "nombre_original": "OFTAPROC M X 10 ML",
      "codigos": [
        "10101011214"
      ]
    }
  },
  {
    "reference_id": "6e7d44b9-064c-41dc-8730-b60092defdb6",
    "brand": "OHMAIGAT",
    "reference": "OHMAIGAT INQUIETOS",
    "weight": "x 200 gr",
    "price": 3800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 1,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301021225",
      "llave": "1225",
      "nombre_original": "OHMAIGAT INQUIETOS X 200 GR",
      "codigos": [
        "10301021225"
      ]
    }
  },
  {
    "reference_id": "f636b50e-29b4-4d0d-abe4-ef5cadb9b3aa",
    "brand": "OL-TRANS",
    "reference": "OL-TRANS",
    "weight": "x 80 gr",
    "price": 63600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10201011234",
      "llave": "1234",
      "nombre_original": "OL-TRANS X 80 GR",
      "codigos": [
        "10201011234"
      ]
    }
  },
  {
    "reference_id": "3a473ee6-2e03-4d6f-9498-667360455b53",
    "brand": "OTIFLE",
    "reference": "OTIFLE",
    "weight": "x 25ml",
    "price": 69900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "101010102120",
      "llave": "2120",
      "nombre_original": "OTIFLEX X 25ML",
      "codigos": [
        "101010102120"
      ]
    }
  },
  {
    "reference_id": "20a51bd3-91e1-4bbd-9d93-41cf7320f987",
    "brand": "OXIMED",
    "reference": "OXIMED ACONDICIONADOR",
    "weight": "591.4ml",
    "price": 133000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301011297",
      "llave": "1297",
      "nombre_original": "OXIMED ACONDICIONADOR 591.4ML",
      "codigos": [
        "10301011297"
      ]
    }
  },
  {
    "reference_id": "b4f37529-f7fb-4931-8291-897a0dd17168",
    "brand": "PANOLOG",
    "reference": "PANOLOG",
    "weight": "15ml",
    "price": 55000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011259",
      "llave": "1259",
      "nombre_original": "PANOLOG 15ML",
      "codigos": [
        "10101011259"
      ]
    }
  },
  {
    "reference_id": "29f9955f-fdb0-4148-a8f6-9d9ba1b1c481",
    "brand": "PAÑAL",
    "reference": "PAÑAL L",
    "weight": "x 12und",
    "price": 26800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601011448",
      "llave": "1448",
      "nombre_original": "PAÑAL L X 12UND",
      "codigos": [
        "10601011448"
      ]
    }
  },
  {
    "reference_id": "f8cb6209-5235-44d5-8e9d-68409e95c88e",
    "brand": "PECHERA",
    "reference": "PECHERA ARNES GIYOOM S - M",
    "weight": "unidad",
    "price": 40800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601010442",
      "llave": "442",
      "nombre_original": "PECHERA ARNES GIYOOM S - M",
      "codigos": [
        "10601010442"
      ]
    }
  },
  {
    "reference_id": "90e18cca-817c-46fd-9b59-56566f2adbd5",
    "brand": "PED",
    "reference": "PED ADULT RP",
    "weight": "x 20 kg",
    "price": 270900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301011283",
      "llave": "1283",
      "nombre_original": "PED ADULT RP X 20 KL",
      "codigos": [
        "10301011283"
      ]
    }
  },
  {
    "reference_id": "bd1c7b7e-6236-442d-ac63-031ec3758ceb",
    "brand": "POMADA",
    "reference": "POMADA ALFA 3 CICATRIZANTE",
    "weight": "30ml",
    "price": 20400,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011353",
      "llave": "1353",
      "nombre_original": "POMADA ALFA 3 CICATRIZANTE 30ML",
      "codigos": [
        "10101011353"
      ]
    }
  },
  {
    "reference_id": "735de9bf-e6c0-4af0-84ee-22c11fc18e85",
    "brand": "PREVICO",
    "reference": "PREVICO",
    "weight": "x 227mg",
    "price": 12000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011363",
      "llave": "1363",
      "nombre_original": "PREVICOX 227MG UND",
      "codigos": [
        "10101011363"
      ]
    }
  },
  {
    "reference_id": "fc7d7642-c2f0-4e01-b363-4bf4e2cf69f3",
    "brand": "PRO PLAN",
    "reference": "PRO PLAN ADULT SMALL",
    "weight": "1kg",
    "price": 57000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301011370",
      "llave": "1370",
      "nombre_original": "PRO PLAN ADULT SMALL 1KG",
      "codigos": [
        "10301011370"
      ]
    }
  },
  {
    "reference_id": "fe9eec8d-2f47-4414-bf6a-91136886408a",
    "brand": "PRO PLAN",
    "reference": "PRO PLAN CANINE LATA OM",
    "weight": "unidad",
    "price": 28600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10401011395",
      "llave": "1395",
      "nombre_original": "PRO PLAN CANINE LATA OM",
      "codigos": [
        "10401011395"
      ]
    }
  },
  {
    "reference_id": "c8ced9b6-8268-4a32-b396-3006214bf2cd",
    "brand": "PRO PLAN",
    "reference": "PRO PLAN FELINE LATA NF",
    "weight": "unidad",
    "price": 16700,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10401011401",
      "llave": "1401",
      "nombre_original": "PRO PLAN FELINE LATA NF",
      "codigos": [
        "10401011401"
      ]
    }
  },
  {
    "reference_id": "fd1d4418-7acc-4632-84a5-ba30203aadf3",
    "brand": "PRO PLAN",
    "reference": "PRO PLAN FELINE NF EARLY CARE",
    "weight": "1.43kg",
    "price": 113600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301021377",
      "llave": "1377",
      "nombre_original": "PRO PLAN FELINE NF EARLY CARE 1.43KG",
      "codigos": [
        "10301021377"
      ]
    }
  },
  {
    "reference_id": "3081f187-df5f-433b-9729-702e81ca1a4f",
    "brand": "PRO PLAN",
    "reference": "PRO PLAN POUCH FELINO ESTERELIZADOS",
    "weight": "85gr",
    "price": 6200,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10301021365",
      "llave": "1365",
      "nombre_original": "PRO PLAN POUCH FELINO ESTERELIZADOS 85GR",
      "codigos": [
        "10301021365"
      ]
    }
  },
  {
    "reference_id": "8b2cbc0d-8a14-4248-a24f-b7c337cb4cce",
    "brand": "PULOFF",
    "reference": "PULOFF 0.67ML",
    "weight": "2-10kg",
    "price": 22900,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "101010102412",
      "llave": "2412",
      "nombre_original": "PULOFF 0.67ML 2-10KG",
      "codigos": [
        "101010102412"
      ]
    }
  },
  {
    "reference_id": "e5ba2c75-3eb7-4416-a405-9d4791c5c875",
    "brand": "REVOLUTION",
    "reference": "REVOLUTION 0.25ML",
    "weight": "1.2 a 2.5kg",
    "price": 43600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011466",
      "llave": "1466",
      "nombre_original": "REVOLUTION 0.25ML 1.2 A 2.5KG",
      "codigos": [
        "10101011466"
      ]
    }
  },
  {
    "reference_id": "98ee5c7b-36d0-4cbc-bc6c-260881374d44",
    "brand": "ROYAL",
    "reference": "ROYAL FIT",
    "weight": "400gr",
    "price": 28000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "103010202220",
      "llave": "2220",
      "nombre_original": "ROYAL FIT 400GR",
      "codigos": [
        "103010202220"
      ]
    }
  },
  {
    "reference_id": "8e4abc47-4a11-4dc6-bfcb-2f85a851145f",
    "brand": "ROYAL CANIN",
    "reference": "ROYAL CANIN DOG LATA GASTRO",
    "weight": "385gr",
    "price": 28600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "103010102261",
      "llave": "2261",
      "nombre_original": "ROYAL CANIN DOG LATA GASTRO 385GRA",
      "codigos": [
        "103010102261"
      ]
    }
  },
  {
    "reference_id": "0505ae8c-32d8-46fa-8f7a-e2bd48c83ef2",
    "brand": "ROYAL CANIN",
    "reference": "ROYAL CANIN URINAY CAT S/O",
    "weight": "1.5kg",
    "price": 135000,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "103010202210",
      "llave": "2210",
      "nombre_original": "ROYAL CANIN URINAY CAT S/O 1.5KG",
      "codigos": [
        "103010202210"
      ]
    }
  },
  {
    "reference_id": "2385769b-97e9-42c2-938b-e8e89cde790f",
    "brand": "SANIDERM",
    "reference": "SANIDERM",
    "weight": "x 40 gr",
    "price": 28500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011532",
      "llave": "1532",
      "nombre_original": "SANIDERM X 40 GR",
      "codigos": [
        "10101011532"
      ]
    }
  },
  {
    "reference_id": "56f9f882-8b08-4fb1-8203-7f19f311f89f",
    "brand": "TAPETE",
    "reference": "TAPETE PETYS EXTRA GRANDE 30",
    "weight": "unidad",
    "price": 0,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "106010101896",
      "llave": "1896",
      "nombre_original": "TAPETE PETYS EXTRA GRANDE 30",
      "codigos": [
        "106010101896"
      ]
    }
  },
  {
    "reference_id": "05a259e9-a4bf-4e00-b03e-5888bf16d520",
    "brand": "TAPETE",
    "reference": "TAPETE X UND",
    "weight": "unidad",
    "price": 3500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "102010101797",
      "llave": "1797",
      "nombre_original": "TAPETE X UND",
      "codigos": [
        "102010101797"
      ]
    }
  },
  {
    "reference_id": "eb29f296-f17e-4cea-907d-fc46140178b0",
    "brand": "TRAILLA",
    "reference": "TRAILLA ESTILO PARACAIDAS XL",
    "weight": "unidad",
    "price": 25600,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10601010456",
      "llave": "456",
      "nombre_original": "TRAILLA ESTILO PARACAIDAS XL",
      "codigos": [
        "10601010456"
      ]
    }
  },
  {
    "reference_id": "7b679013-a669-41d9-8631-84fe019a68a1",
    "brand": "VACUNA",
    "reference": "VACUNA TRIPLE FELINA + LEUCEMIA",
    "weight": "unidad",
    "price": 48800,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011663",
      "llave": "1663",
      "nombre_original": "VACUNA TRIPLE FELINA + LEUCEMIA",
      "codigos": [
        "10101011663"
      ]
    }
  },
  {
    "reference_id": "14d0c9cd-73f5-490d-95a0-672daf53b0a5",
    "brand": "VETMEDIN",
    "reference": "VETMEDIN",
    "weight": "5mg",
    "price": 6300,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "10101011671",
      "llave": "1671",
      "nombre_original": "VETMEDIN 5MG",
      "codigos": [
        "10101011671"
      ]
    }
  },
  {
    "reference_id": "1d2250b4-67e8-40c5-a692-def8d49e0d5b",
    "brand": "VIRBAC",
    "reference": "VIRBAC DOG DIGESTIVE",
    "weight": "x 3kg",
    "price": 181500,
    "currency": "COP",
    "stock": null,
    "active": true,
    "sort_order": 0,
    "metadata": {
      "source": "productos.json",
      "codigo": "103010102461",
      "llave": "2461",
      "nombre_original": "VIRBAC DOG DIGESTIVE X 3KG",
      "codigos": [
        "103010102461"
      ]
    }
  }
]$recovery$::jsonb)
AS x(reference_id uuid, brand text, reference text, weight text, price integer,
     currency text, stock boolean, active boolean, sort_order integer, metadata jsonb);

-- Aborta si se usa otro proyecto o cambió la relación marca/referencia/cliente.
DO $$
BEGIN
  IF (SELECT count(*) FROM restore_presentations_candidates c
      JOIN public.catalog_references r ON r.id = c.reference_id AND r.name = c.reference
      JOIN public.catalog_brands b ON b.id = r.brand_id AND b.name = c.brand
      WHERE b.client_id = '1d2d79c4-19e0-4a6d-83f1-cf714ee7618b'::uuid) <> 94 THEN
    RAISE EXCEPTION 'Las 94 referencias no coinciden con distrifinca. No se restauró ningún dato.';
  END IF;
END $$;

WITH inserted AS (
  INSERT INTO public.catalog_presentations
    (reference_id, weight, price, currency, stock, active, sort_order, metadata)
  SELECT reference_id, weight, price, currency, stock, active, sort_order, metadata
  FROM restore_presentations_candidates
  ON CONFLICT (reference_id, weight) DO NOTHING
  RETURNING id
)
SELECT count(*) AS presentaciones_insertadas FROM inserted;

SELECT count(*) AS faltantes_despues
FROM restore_presentations_candidates c
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_presentations p
  WHERE p.reference_id = c.reference_id AND p.weight = c.weight
);
COMMIT;
