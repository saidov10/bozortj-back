// Category-specific product attribute templates.
// The frontend fetches these to render a dynamic product form per category,
// and the backend uses them to validate required category-specific fields.

import { categoryEnFromTj } from './translations';

export type AttributeFieldType = 'text' | 'number' | 'select' | 'boolean';

export interface AttributeField {
  key: string;                 // stored key inside Product.attributes
  label: string;               // human label (frontend may translate)
  type: AttributeFieldType;
  options?: string[];          // for type 'select'
  unit?: string;               // e.g. "GB", "cm", "ml"
  required?: boolean;
}

const CONDITION: AttributeField = {
  key: 'condition',
  label: 'Condition',
  type: 'select',
  options: ['New', 'Used', 'Refurbished'],
  required: true
};

const WARRANTY: AttributeField = { key: 'warranty', label: 'Warranty', type: 'text' };

// Keyed by the exact Category.name used in the seed.
export const categoryAttributes: Record<string, AttributeField[]> = {
  'Electronics': [
    CONDITION,
    { key: 'ram', label: 'RAM', type: 'select', options: ['2GB', '4GB', '6GB', '8GB', '12GB', '16GB', '32GB'], unit: 'GB' },
    { key: 'storage', label: 'Storage', type: 'select', options: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'] },
    { key: 'screenSize', label: 'Screen Size', type: 'number', unit: 'inch' },
    { key: 'batteryCapacity', label: 'Battery', type: 'number', unit: 'mAh' },
    { key: 'operatingSystem', label: 'Operating System', type: 'text' },
    WARRANTY
  ],
  'Home Appliances': [
    CONDITION,
    { key: 'powerConsumption', label: 'Power Consumption', type: 'number', unit: 'W' },
    { key: 'capacity', label: 'Capacity', type: 'text' },
    { key: 'energyClass', label: 'Energy Class', type: 'select', options: ['A+++', 'A++', 'A+', 'A', 'B', 'C'] },
    WARRANTY
  ],
  'Clothing & Fashion': [
    { key: 'material', label: 'Material', type: 'text', required: true },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Unisex', 'Kids'], required: true },
    { key: 'season', label: 'Season', type: 'select', options: ['Summer', 'Winter', 'Spring', 'Autumn', 'All-Season'] },
    { key: 'fit', label: 'Fit', type: 'select', options: ['Slim', 'Regular', 'Loose', 'Oversized'] },
    { key: 'careInstructions', label: 'Care Instructions', type: 'text' }
  ],
  'Shoes & Footwear': [
    { key: 'material', label: 'Material', type: 'text', required: true },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Unisex', 'Kids'], required: true },
    { key: 'soleType', label: 'Sole Type', type: 'text' },
    { key: 'season', label: 'Season', type: 'select', options: ['Summer', 'Winter', 'All-Season'] }
  ],
  'Bags & Luggage': [
    { key: 'material', label: 'Material', type: 'text', required: true },
    { key: 'capacity', label: 'Capacity', type: 'text' },
    { key: 'dimensions', label: 'Dimensions', type: 'text' },
    { key: 'waterproof', label: 'Waterproof', type: 'boolean' }
  ],
  'Jewelry & Watches': [
    { key: 'material', label: 'Material', type: 'select', options: ['Gold', 'Silver', 'Platinum', 'Stainless Steel', 'Leather', 'Other'], required: true },
    { key: 'gemstone', label: 'Gemstone', type: 'text' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Unisex'] },
    { key: 'waterResistant', label: 'Water Resistant', type: 'boolean' }
  ],
  'Beauty & Personal Care': [
    { key: 'volume', label: 'Volume', type: 'number', unit: 'ml' },
    { key: 'skinType', label: 'Skin Type', type: 'select', options: ['All', 'Dry', 'Oily', 'Combination', 'Sensitive'] },
    { key: 'expiryDate', label: 'Expiry Date', type: 'text' },
    { key: 'organic', label: 'Organic', type: 'boolean' }
  ],
  'Health & Wellness': [
    { key: 'form', label: 'Form', type: 'select', options: ['Tablet', 'Capsule', 'Liquid', 'Powder', 'Cream', 'Device'] },
    { key: 'quantity', label: 'Quantity', type: 'text' },
    { key: 'expiryDate', label: 'Expiry Date', type: 'text' },
    { key: 'usage', label: 'Usage / Directions', type: 'text' }
  ],
  'Home & Living': [
    { key: 'material', label: 'Material', type: 'text', required: true },
    { key: 'dimensions', label: 'Dimensions', type: 'text' },
    { key: 'assemblyRequired', label: 'Assembly Required', type: 'boolean' }
  ],
  'Groceries & Food': [
    { key: 'weight', label: 'Weight / Volume', type: 'text', required: true },
    { key: 'expiryDate', label: 'Expiry Date', type: 'text' },
    { key: 'ingredients', label: 'Ingredients', type: 'text' },
    { key: 'halal', label: 'Halal', type: 'boolean' },
    { key: 'storage', label: 'Storage Conditions', type: 'text' }
  ],
  'Baby & Kids': [
    { key: 'ageRange', label: 'Age Range', type: 'text', required: true },
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'safetyCertified', label: 'Safety Certified', type: 'boolean' }
  ],
  'Toys & Games': [
    { key: 'ageRange', label: 'Age Range', type: 'text', required: true },
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'batteryRequired', label: 'Battery Required', type: 'boolean' },
    { key: 'pieces', label: 'Number of Pieces', type: 'number' }
  ],
  'Sports & Outdoors': [
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'sport', label: 'Sport / Activity', type: 'text' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Unisex', 'Kids'] }
  ],
  'Automotive & Motorcycle': [
    CONDITION,
    { key: 'compatibility', label: 'Compatibility (Make/Model)', type: 'text', required: true },
    { key: 'partNumber', label: 'Part Number', type: 'text' },
    WARRANTY
  ],
  'Tools & Home Improvement': [
    CONDITION,
    { key: 'powerSource', label: 'Power Source', type: 'select', options: ['Manual', 'Electric', 'Battery', 'Pneumatic', 'Gas'] },
    { key: 'material', label: 'Material', type: 'text' },
    WARRANTY
  ],
  'Garden & Outdoor': [
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'dimensions', label: 'Dimensions', type: 'text' },
    { key: 'weatherResistant', label: 'Weather Resistant', type: 'boolean' }
  ],
  'Books & Stationery': [
    { key: 'author', label: 'Author', type: 'text' },
    { key: 'language', label: 'Language', type: 'text' },
    { key: 'pages', label: 'Pages', type: 'number' },
    { key: 'format', label: 'Format', type: 'select', options: ['Hardcover', 'Paperback', 'E-book'] },
    { key: 'publisher', label: 'Publisher', type: 'text' }
  ],
  'Office & Business': [
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'dimensions', label: 'Dimensions', type: 'text' },
    WARRANTY
  ],
  'Music & Instruments': [
    CONDITION,
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'forBeginners', label: 'Suitable for Beginners', type: 'boolean' }
  ],
  'Pet Supplies': [
    { key: 'petType', label: 'Pet Type', type: 'select', options: ['Dog', 'Cat', 'Bird', 'Fish', 'Other'], required: true },
    { key: 'weight', label: 'Weight / Size', type: 'text' },
    { key: 'ageRange', label: 'Age Range', type: 'text' }
  ],
  'Arts & Crafts': [
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'quantity', label: 'Quantity', type: 'text' },
    { key: 'ageRange', label: 'Age Range', type: 'text' }
  ],
  'Industrial & Scientific': [
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'specification', label: 'Specification', type: 'text' },
    { key: 'certification', label: 'Certification', type: 'text' }
  ]
};

// Fallback for any category that has no explicit template.
export const defaultAttributeFields: AttributeField[] = [
  CONDITION,
  { key: 'material', label: 'Material', type: 'text' },
  { key: 'countryOfOrigin', label: 'Country of Origin', type: 'text' },
  WARRANTY
];

export const getAttributeFields = (categoryName?: string | null): AttributeField[] => {
  if (categoryName) {
    // Names are stored in Tajik; resolve back to the English template key.
    if (categoryAttributes[categoryName]) {
      return categoryAttributes[categoryName];
    }
    const enKey = categoryEnFromTj[categoryName];
    if (enKey && categoryAttributes[enKey]) {
      return categoryAttributes[enKey];
    }
  }
  return defaultAttributeFields;
};
