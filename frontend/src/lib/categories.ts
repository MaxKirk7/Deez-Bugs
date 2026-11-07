import {
  Baby,
  CircleDashed,
  Fuel,
  Globe,
  HeartPulse,
  House,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Ticket,
  Truck,
  UtensilsCrossed,
  Package,
  type LucideIcon,
} from 'lucide-react'
import type { Category } from '../types'

/** Same names as LABELS in src/deez_bugs/ml/model.py, plus an icon each. */
export const CATEGORY: Record<Category, { label: string; icon: LucideIcon }> = {
  grocery_pos: { label: 'Groceries (in store)', icon: ShoppingCart },
  grocery_net: { label: 'Groceries (online)', icon: Truck },
  food_dining: { label: 'Eating out', icon: UtensilsCrossed },
  gas_transport: { label: 'Fuel & transport', icon: Fuel },
  shopping_pos: { label: 'Shopping (in store)', icon: ShoppingBag },
  shopping_net: { label: 'Shopping (online)', icon: Package },
  home: { label: 'Home', icon: House },
  kids_pets: { label: 'Kids & pets', icon: Baby },
  entertainment: { label: 'Entertainment', icon: Ticket },
  personal_care: { label: 'Personal care', icon: Sparkles },
  health_fitness: { label: 'Health & fitness', icon: HeartPulse },
  travel: { label: 'Travel', icon: Plane },
  misc_pos: { label: 'Other (in store)', icon: CircleDashed },
  misc_net: { label: 'Other (online)', icon: Globe },
}

export const CATEGORIES = Object.keys(CATEGORY) as Category[]
