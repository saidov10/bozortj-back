const fs = require('fs');
const path = require('path');

const swaggerPath = path.join(__dirname, '..', 'src', 'swagger.json');
const doc = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));

// 1. Add Address endpoints
doc.paths["/api/addresses"] = {
  "get": {
    "summary": "Get Addresses / Список адресов / Рӯйхати адресҳо",
    "tags": ["Authentication"],
    "security": [{ "BearerAuth": [] }],
    "description": "🇬🇧 **EN:** List buyer's saved addresses.\n🇷🇺 **RU:** Получить список сохраненных адресов покупателя.\n🇹🇯 **TJ:** Гирифтани рӯйхати адресҳои сабтшудаи харидор.",
    "responses": {
      "200": { "description": "Addresses list" }
    }
  },
  "post": {
    "summary": "Create Address / Создать адрес / Сохтани адрес",
    "tags": ["Authentication"],
    "security": [{ "BearerAuth": [] }],
    "description": "🇬🇧 **EN:** Add a new address to the address book. (Buyers only)\n🇷🇺 **RU:** Добавить новый адрес доставки. (Только для Покупателей)\n🇹🇯 **TJ:** Иловаи адреси нави интиқол. (Танҳо барои Харидорон)",
    "requestBody": {
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["title", "city", "street", "building"],
            "properties": {
              "title": { "type": "string", "example": "Home" },
              "city": { "type": "string", "example": "Dushanbe" },
              "street": { "type": "string", "example": "Rudaki Ave" },
              "building": { "type": "string", "example": "12" },
              "apartment": { "type": "string", "example": "4B" },
              "postalCode": { "type": "string", "example": "734000" },
              "landmark": { "type": "string", "example": "Near Opera & Ballet Theater" },
              "isDefault": { "type": "boolean", "default": false }
            }
          }
        }
      }
    },
    "responses": {
      "201": { "description": "Address created" }
    }
  }
};

doc.paths["/api/addresses/{id}"] = {
  "put": {
    "summary": "Edit Address / Изменить адрес / Таҳрири адрес",
    "tags": ["Authentication"],
    "security": [{ "BearerAuth": [] }],
    "parameters": [
      { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
    ],
    "requestBody": {
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "city": { "type": "string" },
              "street": { "type": "string" },
              "building": { "type": "string" },
              "apartment": { "type": "string" },
              "postalCode": { "type": "string" },
              "landmark": { "type": "string" },
              "isDefault": { "type": "boolean" }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Address updated" }
    }
  },
  "delete": {
    "summary": "Delete Address / Удалить адрес / Нест кардани адрес",
    "tags": ["Authentication"],
    "security": [{ "BearerAuth": [] }],
    "parameters": [
      { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "Address deleted" }
    }
  }
};

doc.paths["/api/addresses/{id}/default"] = {
  "put": {
    "summary": "Set Default Address / Сделать основным / Сабти адрес ҳамчун асосӣ",
    "tags": ["Authentication"],
    "security": [{ "BearerAuth": [] }],
    "parameters": [
      { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "Address set as default" }
    }
  }
};

// 2. Add Review Reply endpoint
doc.paths["/api/products/reviews/{id}/reply"] = {
  "post": {
    "summary": "Reply to Review / Ответить на отзыв / Ҷавоб ба тақриз",
    "tags": ["Products"],
    "security": [{ "BearerAuth": [] }],
    "description": "🇬🇧 **EN:** Post a reply to customer review. (Sellers only)\n🇷🇺 **RU:** Опубликовать ответ продавца на отзыв покупателя. (Только для Продавцов)\n🇹🇯 **TJ:** Навиштани ҷавоби фурӯшанда ба фикри харидор. (Танҳо барои Фурӯшандагон)",
    "parameters": [
      { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Review ID" }
    ],
    "requestBody": {
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["reply"],
            "properties": {
              "reply": { "type": "string", "example": "Thank you for shopping with us!" }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Reply saved successfully" }
    }
  }
};

// 3. Add Refund Return endpoints
doc.paths["/api/orders/{id}/refund"] = {
  "post": {
    "summary": "Request Refund / Оформить возврат / Дархости бозпасдиҳӣ",
    "tags": ["Orders"],
    "security": [{ "BearerAuth": [] }],
    "description": "🇬🇧 **EN:** Request order return and refund (Allows multiple photos). (Buyers only)\n🇷🇺 **RU:** Подать заявку на возврат товара и средств (можно прикрепить фото). (Только для Покупателей)\n🇹🇯 **TJ:** Пешниҳоди дархости бозпасдиҳии мол ва маблағ (бо аксҳо). (Танҳо барои Харидорон)",
    "parameters": [
      { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Order ID" }
    ],
    "requestBody": {
      "content": {
        "multipart/form-data": {
          "schema": {
            "type": "object",
            "required": ["reason"],
            "properties": {
              "reason": { "type": "string", "example": "Defective item received" },
              "refundImages": { "type": "string", "format": "binary" }
            }
          }
        }
      }
    },
    "responses": {
      "201": { "description": "Refund request submitted" }
    }
  },
  "put": {
    "summary": "Process Refund / Подтвердить или отклонить возврат / Қабул ё радди бозпасдиҳӣ",
    "tags": ["Orders"],
    "security": [{ "BearerAuth": [] }],
    "description": "🇬🇧 **EN:** Approve, reject or mark return request as disputed. (Sellers only)\n🇷🇺 **RU:** Одобрить, отклонить или перевести возврат в спорный статус. (Только для Продавцов)\n🇹🇯 **TJ:** Қабул, рад ё баҳснок кардани дархости бозпасдиҳӣ. (Танҳо барои Фурӯшандагон)",
    "parameters": [
      { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Order ID" }
    ],
    "requestBody": {
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["status"],
            "properties": {
              "status": { "type": "string", "enum": ["APPROVED", "REJECTED", "DISPUTED"], "example": "APPROVED" },
              "explanation": { "type": "string", "example": "Refund request approved, stock returned." }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Refund request processed successfully" }
    }
  }
};

doc.paths["/api/orders/{id}/refund/dispute"] = {
  "put": {
    "summary": "Resolve Refund Dispute / Разрешить спор / Ҳалли баҳси бозпасдиҳӣ",
    "tags": ["Admin Moderation"],
    "security": [{ "BearerAuth": [] }],
    "description": "🇬🇧 **EN:** Resolve disputed refund request as approved or rejected. (Admins only)\n🇷🇺 **RU:** Закрыть спор по возврату в пользу покупателя или продавца. (Только для Администраторов)\n🇹🇯 **TJ:** Баррасии ниҳоии баҳси бозпасдиҳӣ (қабул ё рад). (Танҳо барои Администраторҳо)",
    "parameters": [
      { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Order ID" }
    ],
    "requestBody": {
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["status"],
            "properties": {
              "status": { "type": "string", "enum": ["APPROVED", "REJECTED"], "example": "APPROVED" },
              "explanation": { "type": "string", "example": "Disputed item was validated, refunding." }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Dispute resolved successfully" }
    }
  }
};

// 4. Add Shop settings endpoint
doc.paths["/api/shops/settings/auto-reply"] = {
  "put": {
    "summary": "Shop Auto-Reply Settings / Настройки автоответчика / Танзимоти чат-бот",
    "tags": ["Shops"],
    "security": [{ "BearerAuth": [] }],
    "description": "🇬🇧 **EN:** Update seller's chatbot settings and offline message. (Sellers only)\n🇷🇺 **RU:** Изменить настройки автоответчика и текст приветственного сообщения. (Только для Продавцов)\n🇹🇯 **TJ:** Навсозии танзимот ва матни паёми худкори мағоза. (Танҳо барои Фурӯшандагон)",
    "requestBody": {
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "autoReplyText": { "type": "string", "example": "Hello! We are currently offline, but we will contact you shortly." },
              "autoReplyEnabled": { "type": "boolean", "default": true }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Shop settings updated" }
    }
  }
};

// 5. Add Admin Get Users endpoint
doc.paths["/api/admin/users"] = {
  "get": {
    "summary": "Get All Users / Получить список пользователей / Рӯйхати ҳамаи корбарон",
    "tags": ["Admin Moderation"],
    "security": [{ "BearerAuth": [] }],
    "description": "🇬🇧 **EN:** Retrieve list of all users in the system. (Admins only)\n🇷🇺 **RU:** Получить список всех пользователей системы. (Только для Администраторов)\n🇹🇯 **TJ:** Гирифтани рӯйхати ҳамаи корбарони система. (Танҳо барои Администраторҳо)",
    "responses": {
      "200": { "description": "List of users" }
    }
  }
};

fs.writeFileSync(swaggerPath, JSON.stringify(doc, null, 2), 'utf8');
console.log("Successfully injected Swagger endpoints!");
