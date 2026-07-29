// English -> Tajik translations for category, subcategory and color names.
// The DB stores the Tajik `name` (so the API returns Tajik directly); these maps
// are the single source of truth used by the seed and the rename migration.

export const categoryTj: Record<string, string> = {
  'Electronics': 'Электроника',
  'Home Appliances': 'Асбобҳои маишӣ',
  'Clothing & Fashion': 'Либос ва Мӯд',
  'Shoes & Footwear': 'Пойафзол',
  'Bags & Luggage': 'Сумка ва Бағоҷ',
  'Jewelry & Watches': 'Ҷавоҳирот ва Соатҳо',
  'Beauty & Personal Care': 'Зебоӣ ва Нигоҳубини шахсӣ',
  'Health & Wellness': 'Саломатӣ ва Тандурустӣ',
  'Home & Living': 'Хона ва Рӯзгор',
  'Groceries & Food': 'Озуқаворӣ ва Хӯрокворӣ',
  'Baby & Kids': 'Кӯдакон ва Навзодон',
  'Toys & Games': 'Бозичаҳо ва Бозиҳо',
  'Sports & Outdoors': 'Варзиш ва Фароғат',
  'Automotive & Motorcycle': 'Мошин ва Мотосикл',
  'Tools & Home Improvement': 'Асбобҳо ва Таъмири хона',
  'Garden & Outdoor': 'Боғ ва Ҳавлӣ',
  'Books & Stationery': 'Китобҳо ва Лавозимоти хаттӣ',
  'Office & Business': 'Офис ва Тиҷорат',
  'Music & Instruments': 'Мусиқӣ ва Асбобҳо',
  'Pet Supplies': 'Лавозимоти ҳайвонот',
  'Arts & Crafts': 'Санъат ва Ҳунар',
  'Industrial & Scientific': 'Саноатӣ ва Илмӣ'
};

export const subcategoryTj: Record<string, string> = {
  // Electronics
  'Smartphones': 'Смартфонҳо', 'Mobile Phone Accessories': 'Лавозимоти телефон',
  'Laptops': 'Ноутбукҳо', 'Tablets': 'Планшетҳо', 'Desktop Computers': 'Компютерҳои мизӣ',
  'Monitors': 'Мониторҳо', 'Computer Components': 'Қисмҳои компютер',
  'Computer Accessories': 'Лавозимоти компютер', 'Headphones': 'Гӯшмонакҳо',
  'Speakers': 'Динамикҳо', 'Smartwatches': 'Соатҳои ақлманд', 'Cameras': 'Камераҳо',
  'Camera Accessories': 'Лавозимоти камера', 'Televisions': 'Телевизорҳо',
  'Gaming Consoles': 'Консолҳои бозӣ', 'Video Games': 'Бозиҳои видеоӣ', 'Drones': 'Дронҳо',
  'Printers & Scanners': 'Принтерҳо ва Сканерҳо', 'Power Banks': 'Пауэрбанкҳо',
  'Chargers & Cables': 'Зарядкунакҳо ва Симҳо', 'Storage & USB Drives': 'Хотира ва USB',
  'Networking & Routers': 'Шабака ва Роутерҳо',
  // Home Appliances
  'Refrigerators': 'Яхдонҳо', 'Washing Machines': 'Мошинҳои ҷомашӯӣ',
  'Dishwashers': 'Зарфшӯякҳо', 'Microwaves': 'Микроволновкаҳо',
  'Ovens & Cooktops': 'Танӯрҳо ва Плитаҳо', 'Vacuum Cleaners': 'Чангкашакҳо',
  'Air Conditioners': 'Кондитсионерҳо', 'Fans': 'Вентиляторҳо', 'Heaters': 'Гармкунакҳо',
  'Water Heaters': 'Обгармкунакҳо', 'Blenders & Mixers': 'Блендерҳо ва Миксерҳо',
  'Coffee Makers': 'Қаҳваҷӯшҳо', 'Kettles': 'Чойникҳо', 'Toasters': 'Тостерҳо',
  'Irons': 'Дарзмолҳо', 'Sewing Machines': 'Мошинҳои дӯзандагӣ',
  'Air Purifiers': 'Тозакунакҳои ҳаво',
  // Clothing & Fashion
  "Men's Clothing": 'Либоси мардона', "Women's Clothing": 'Либоси занона',
  "Kids' Clothing": 'Либоси кӯдакона', 'T-Shirts': 'Футболкаҳо', 'Shirts': 'Куйлакҳо',
  'Jeans': 'Ҷинсҳо', 'Trousers': 'Шимҳо', 'Dresses': 'Куртаҳои занона', 'Skirts': 'Доманҳо',
  'Jackets & Coats': 'Курткаҳо ва Палтоҳо', 'Sweaters & Hoodies': 'Свитерҳо ва Худиҳо',
  'Activewear': 'Либоси варзишӣ', 'Underwear & Lingerie': 'Либоси таг',
  'Socks & Hosiery': 'Ҷӯробҳо', 'Sleepwear': 'Либоси хоб', 'Traditional Wear': 'Либоси миллӣ',
  'Suits & Formal Wear': 'Костюмҳо', 'Swimwear': 'Либоси шиноварӣ',
  // Shoes & Footwear
  "Men's Shoes": 'Пойафзоли мардона', "Women's Shoes": 'Пойафзоли занона',
  "Kids' Shoes": 'Пойафзоли кӯдакона', 'Sneakers': 'Кроссовкаҳо', 'Boots': 'Мӯзаҳо',
  'Sandals': 'Сандалҳо', 'Formal Shoes': 'Туфлиҳо', 'Slippers': 'Шиппакҳо',
  'Sports Shoes': 'Пойафзоли варзишӣ', 'Heels': 'Пошнабаландҳо',
  // Bags & Luggage
  'Backpacks': 'Рюкзакҳо', 'Handbags': 'Сумкаҳои дастӣ', 'Wallets': 'Ҳамёнҳо',
  'Suitcases': 'Чамадонҳо', 'Travel Bags': 'Сумкаҳои сафарӣ', 'Laptop Bags': 'Сумкаҳои ноутбук',
  'Duffel Bags': 'Сумкаҳои варзишӣ', 'Purses & Clutches': 'Ҳамёнҳои занона',
  'School Bags': 'Сумкаҳои мактабӣ',
  // Jewelry & Watches
  'Rings': 'Ангуштаринҳо', 'Necklaces': 'Гарданбандҳо', 'Earrings': 'Гӯшворҳо',
  'Bracelets': 'Дастпонаҳо', 'Watches': 'Соатҳо', 'Gold Jewelry': 'Ҷавоҳироти тиллоӣ',
  'Silver Jewelry': 'Ҷавоҳироти нуқрагӣ', 'Fashion Jewelry': 'Ҷавоҳироти муд',
  'Sunglasses': 'Айнакҳои офтобӣ',
  // Beauty & Personal Care
  'Skincare': 'Нигоҳубини пӯст', 'Makeup': 'Ороиш', 'Fragrances': 'Атрҳо',
  'Hair Care': 'Нигоҳубини мӯй', 'Nail Care': 'Нигоҳубини нохун', 'Bath & Body': 'Ҳаммом ва Бадан',
  "Men's Grooming": 'Нигоҳубини мардона', 'Beauty Tools': 'Асбобҳои зебоӣ',
  'Oral Care': 'Нигоҳубини даҳон', 'Shaving & Hair Removal': 'Риштарошӣ',
  // Health & Wellness
  'Vitamins & Supplements': 'Витаминҳо ва Иловагиҳо', 'Medical Supplies': 'Лавозимоти тиббӣ',
  'First Aid': 'Ёрии аввалия', 'Fitness Nutrition': 'Ғизои варзишӣ',
  'Massage & Relaxation': 'Массаж ва Оромӣ', 'Personal Hygiene': 'Гигиенаи шахсӣ',
  'Health Monitors': 'Дастгоҳҳои саломатӣ', 'Mobility Aids': 'Воситаҳои ёрирасон',
  // Home & Living
  'Furniture': 'Мебел', 'Kitchenware': 'Лавозимоти ошхона',
  'Tableware & Dinnerware': 'Зарфҳои дастархон', 'Bedding': 'Кӯрпа ва Болишт',
  'Bath & Towels': 'Ҳаммом ва Сачоқҳо', 'Lighting': 'Рӯшноӣ', 'Home Decor': 'Ороиши хона',
  'Curtains & Blinds': 'Пардаҳо', 'Rugs & Carpets': 'Қолинҳо',
  'Storage & Organization': 'Нигоҳдорӣ ва Тартиб', 'Cleaning Supplies': 'Лавозимоти тозакунӣ',
  'Clocks': 'Соатҳои деворӣ', 'Mirrors': 'Оинаҳо', 'Candles & Scents': 'Шамъҳо ва Атрҳо',
  // Groceries & Food
  'Fresh Produce': 'Маҳсулоти тару тоза', 'Fruits & Vegetables': 'Мева ва Сабзавот',
  'Meat & Poultry': 'Гӯшт ва Парранда', 'Seafood': 'Маҳсулоти баҳрӣ',
  'Dairy & Eggs': 'Ширворӣ ва Тухм', 'Bakery': 'Маҳсулоти нонӣ', 'Beverages': 'Нӯшокиҳо',
  'Water & Juices': 'Об ва Шарбатҳо', 'Tea & Coffee': 'Чой ва Қаҳва', 'Snacks': 'Газакҳо',
  'Sweets & Confectionery': 'Ширинӣ ва Қаннодӣ', 'Frozen Foods': 'Хӯрокҳои яхкарда',
  'Canned & Packaged': 'Консерваҳо ва Бастабандӣ', 'Grains & Pasta': 'Ғалладона ва Макарон',
  'Oils & Spices': 'Равған ва Ҳанут', 'Nuts & Dried Fruits': 'Чормағз ва Мевахушк',
  'Honey & Jams': 'Асал ва Мураббо', 'Baby Food': 'Ғизои кӯдакона',
  // Baby & Kids
  'Diapers': 'Памперсҳо', 'Baby Clothing': 'Либоси навзод', 'Baby Feeding': 'Ғизодиҳии навзод',
  'Strollers': 'Аробачаҳо', 'Car Seats': 'Курсиҳои мошин', 'Baby Toys': 'Бозичаҳои навзод',
  'Nursery Furniture': 'Мебели кӯдакона', 'Baby Bath & Skincare': 'Ҳаммом ва Нигоҳубини навзод',
  'Baby Safety': 'Бехатарии навзод',
  // Toys & Games
  'Action Figures': 'Фигуркаҳо', 'Dolls': 'Лӯхтакҳо', 'Building Blocks': 'Конструкторҳо',
  'Board Games': 'Бозиҳои мизӣ', 'Puzzles': 'Пазлҳо', 'Educational Toys': 'Бозичаҳои таълимӣ',
  'Remote Control Toys': 'Бозичаҳои идорашаванда', 'Outdoor Play': 'Бозиҳои берунӣ',
  'Arts & Crafts for Kids': 'Ҳунар барои кӯдакон', 'Stuffed Animals': 'Бозичаҳои мулоим',
  // Sports & Outdoors
  'Fitness Equipment': 'Таҷҳизоти фитнес', 'Gym Accessories': 'Лавозимоти толори варзиш',
  'Sportswear': 'Либоси варзишӣ (спорт)', 'Cycling': 'Велосипедронӣ',
  'Camping & Hiking': 'Кемпинг ва Сайёҳӣ', 'Team Sports': 'Варзишҳои дастаҷамъӣ',
  'Football': 'Футбол', 'Water Sports': 'Варзишҳои обӣ', 'Winter Sports': 'Варзишҳои зимистонӣ',
  'Outdoor Gear': 'Таҷҳизоти сайёҳӣ', 'Fishing': 'Моҳидорӣ', 'Hunting': 'Шикор',
  // Automotive & Motorcycle
  'Car Accessories': 'Лавозимоти мошин', 'Car Parts': 'Қисмҳои мошин',
  'Car Electronics': 'Электроникаи мошин', 'Tires & Wheels': 'Чархҳо ва Ғилдиракҳо',
  'Oils & Fluids': 'Равғанҳо ва Моеъҳо', 'Car Care': 'Нигоҳубини мошин',
  'Motorcycle Parts': 'Қисмҳои мотосикл', 'Motorcycle Accessories': 'Лавозимоти мотосикл',
  'Tools & Equipment': 'Асбобҳо ва Таҷҳизот', 'Safety & Security': 'Бехатарӣ',
  // Tools & Home Improvement
  'Hand Tools': 'Асбобҳои дастӣ', 'Power Tools': 'Асбобҳои барқӣ',
  'Building Materials': 'Масолеҳи сохтмонӣ', 'Plumbing': 'Сантехника', 'Electrical': 'Электрика',
  'Paint & Supplies': 'Ранг ва Лавозимот', 'Hardware': 'Оҳанолот',
  'Safety Equipment': 'Таҷҳизоти бехатарӣ', 'Doors & Windows': 'Дарҳо ва Тирезаҳо',
  'Measuring Tools': 'Асбобҳои ченкунӣ',
  // Garden & Outdoor
  'Plants & Seeds': 'Растаниҳо ва Тухмиҳо', 'Garden Tools': 'Асбобҳои боғдорӣ',
  'Outdoor Furniture': 'Мебели ҳавлӣ', 'Grills & BBQ': 'Мангал ва Гриль',
  'Pots & Planters': 'Гулдонҳо', 'Lawn Care': 'Нигоҳубини сабзазор', 'Fencing': 'Панҷараҳо',
  'Watering & Irrigation': 'Обёрӣ', 'Pest Control': 'Мубориза бо ҳашарот',
  // Books & Stationery
  'Fiction': 'Бадеӣ', 'Non-Fiction': 'Ғайрибадеӣ', "Children's Books": 'Китобҳои кӯдакона',
  'Textbooks': 'Китобҳои дарсӣ', 'Religious Books': 'Китобҳои динӣ', 'Notebooks': 'Дафтарҳо',
  'Pens & Pencils': 'Қаламҳо', 'Office Supplies': 'Лавозимоти офисӣ',
  'Art Supplies': 'Лавозимоти рассомӣ', 'Calendars & Planners': 'Тақвимҳо ва Ежедневникҳо',
  // Office & Business
  'Office Furniture': 'Мебели офисӣ', 'Office Electronics': 'Электроникаи офисӣ',
  'Printers & Ink': 'Принтерҳо ва Ранг', 'Paper Products': 'Маҳсулоти коғазӣ',
  'Filing & Storage': 'Ҳуҷҷатнигаҳдорӣ', 'Business Supplies': 'Лавозимоти тиҷоратӣ',
  'Calculators': 'Ҳисобкунакҳо', 'Whiteboards & Presentation': 'Тахтаҳо ва Презентатсия',
  // Music & Instruments
  'Guitars': 'Гитараҳо', 'Keyboards & Pianos': 'Синтезаторҳо ва Пианиноҳо',
  'Drums & Percussion': 'Барабанҳо', 'Wind Instruments': 'Асбобҳои нафасӣ',
  'String Instruments': 'Асбобҳои торӣ', 'Traditional Instruments': 'Асбобҳои миллӣ',
  'DJ & Studio Equipment': 'Таҷҳизоти DJ ва студия', 'Music Accessories': 'Лавозимоти мусиқӣ',
  // Pet Supplies
  'Dog Supplies': 'Лавозимоти сагҳо', 'Cat Supplies': 'Лавозимоти гурбаҳо',
  'Bird Supplies': 'Лавозимоти паррандаҳо', 'Fish & Aquarium': 'Моҳӣ ва Аквариум',
  'Pet Food': 'Ғизои ҳайвонот', 'Pet Grooming': 'Нигоҳубини ҳайвонот',
  'Pet Toys': 'Бозичаҳои ҳайвонот', 'Pet Beds & Housing': 'Ҷойхоб ва Лонаҳо',
  // Arts & Crafts
  'Painting Supplies': 'Лавозимоти рангубор', 'Drawing Supplies': 'Лавозимоти расмкашӣ',
  'Craft Kits': 'Маҷмӯаҳои ҳунарӣ', 'Sewing & Knitting': 'Дӯзандагӣ ва Бофандагӣ',
  'Beads & Jewelry Making': 'Маҳтобӣ ва Заргарӣ', 'Scrapbooking': 'Скрапбукинг',
  'Fabric & Textiles': 'Матоъ ва Бофта',
  // Industrial & Scientific
  'Lab Equipment': 'Таҷҳизоти лабораторӣ', 'Safety Supplies': 'Лавозимоти бехатарӣ',
  'Industrial Tools': 'Асбобҳои саноатӣ', 'Packaging Materials': 'Масолеҳи бастабандӣ',
  'Measuring Instruments': 'Асбобҳои ченкунии дақиқ', 'Cleaning & Janitorial': 'Тозакунӣ',
  'Agricultural Supplies': 'Лавозимоти кишоварзӣ'
};

export const colorTj: Record<string, string> = {
  'Black': 'Сиёҳ', 'White': 'Сафед', 'Grey': 'Хокистарӣ', 'Light Grey': 'Хокистарии равшан',
  'Dark Grey': 'Хокистарии торик', 'Charcoal': 'Ангиштӣ', 'Silver': 'Нуқрагӣ',
  'Red': 'Сурх', 'Dark Red': 'Сурхи торик', 'Maroon': 'Марунӣ', 'Burgundy': 'Бордо',
  'Crimson': 'Қирмизӣ', 'Pink': 'Гулобӣ', 'Hot Pink': 'Гулобии равшан', 'Rose': 'Садбаргӣ',
  'Coral': 'Марҷонӣ', 'Salmon': 'Лососӣ', 'Orange': 'Норинҷӣ', 'Dark Orange': 'Норинҷии торик',
  'Peach': 'Шафтолуӣ', 'Gold': 'Тиллоӣ', 'Yellow': 'Зард', 'Mustard': 'Хардалӣ',
  'Brown': 'Қаҳваранг', 'Chocolate': 'Шоколадӣ', 'Tan': 'Қаҳваи равшан', 'Beige': 'Беж',
  'Cream': 'Кремӣ', 'Ivory': 'Оҷӣ', 'Khaki': 'Хокӣ', 'Bronze': 'Биринҷӣ', 'Copper': 'Мисӣ',
  'Rose Gold': 'Тиллои гулобӣ', 'Green': 'Сабз', 'Dark Green': 'Сабзи торик',
  'Light Green': 'Сабзи равшан', 'Lime': 'Лаймӣ', 'Olive': 'Зайтунӣ', 'Mint': 'Нӯъноӣ',
  'Emerald': 'Зумуррадӣ', 'Teal': 'Кабудсабз', 'Blue': 'Кабуд', 'Navy': 'Кабуди торик',
  'Royal Blue': 'Кабуди шоҳона', 'Sky Blue': 'Осмонранг', 'Light Blue': 'Кабуди равшан',
  'Turquoise': 'Фирӯзаӣ', 'Cyan': 'Фирӯзаи равшан', 'Purple': 'Арғувонӣ', 'Violet': 'Бунафш',
  'Indigo': 'Нилобӣ', 'Lavender': 'Лавандагӣ', 'Magenta': 'Арғувони сурх',
  'Multicolor': 'Бисёрранг', 'Transparent': 'Шаффоф'
};

// Reverse map: Tajik category name -> English key (used to look up attribute templates).
export const categoryEnFromTj: Record<string, string> = Object.entries(categoryTj)
  .reduce((acc, [en, tjName]) => {
    acc[tjName] = en;
    return acc;
  }, {} as Record<string, string>);

// Translate a name to Tajik, falling back to the original if no translation exists.
export const tj = (map: Record<string, string>, name: string): string => map[name] ?? name;
