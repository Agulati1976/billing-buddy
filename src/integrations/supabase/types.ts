export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      barcode_catalog: {
        Row: {
          barcode: string
          brand: string | null
          color: string | null
          contributed_by: string | null
          contributor_business_id: string | null
          created_at: string
          description: string | null
          flavour: string | null
          hsn_code: string | null
          id: string
          image_url: string | null
          mrp: number
          name: string
          scan_count: number
          tax_rate: number
          unit: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          barcode: string
          brand?: string | null
          color?: string | null
          contributed_by?: string | null
          contributor_business_id?: string | null
          created_at?: string
          description?: string | null
          flavour?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          mrp?: number
          name: string
          scan_count?: number
          tax_rate?: number
          unit?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          barcode?: string
          brand?: string | null
          color?: string | null
          contributed_by?: string | null
          contributor_business_id?: string | null
          created_at?: string
          description?: string | null
          flavour?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          mrp?: number
          name?: string
          scan_count?: number
          tax_rate?: number
          unit?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      batches: {
        Row: {
          batch_number: string
          business_id: string
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          item_id: string
          mfg_date: string | null
          notes: string | null
          quantity: number
          updated_at: string
        }
        Insert: {
          batch_number: string
          business_id: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          item_id: string
          mfg_date?: string | null
          notes?: string | null
          quantity?: number
          updated_at?: string
        }
        Update: {
          batch_number?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          item_id?: string
          mfg_date?: string | null
          notes?: string | null
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          business_id: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_features: {
        Row: {
          business_id: string
          created_at: string
          pos_enabled: boolean
          pos_enabled_at: string | null
          pos_enabled_by: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          pos_enabled?: boolean
          pos_enabled_at?: string | null
          pos_enabled_by?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          pos_enabled?: boolean
          pos_enabled_at?: string | null
          pos_enabled_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          pincode: string | null
          pincode_rank: number | null
          state: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          pincode?: string | null
          pincode_rank?: number | null
          state?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          pincode?: string | null
          pincode_rank?: number | null
          state?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          batch_id: string | null
          created_at: string
          discount_pct: number
          hsn_code: string | null
          id: string
          invoice_id: string
          item_id: string | null
          item_name: string
          price: number
          quantity: number
          tax_amount: number
          tax_rate: number
          taxable_amount: number
          total_amount: number
          unit: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          discount_pct?: number
          hsn_code?: string | null
          id?: string
          invoice_id: string
          item_id?: string | null
          item_name: string
          price?: number
          quantity?: number
          tax_amount?: number
          tax_rate?: number
          taxable_amount?: number
          total_amount?: number
          unit?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          discount_pct?: number
          hsn_code?: string | null
          id?: string
          invoice_id?: string
          item_id?: string | null
          item_name?: string
          price?: number
          quantity?: number
          tax_amount?: number
          tax_rate?: number
          taxable_amount?: number
          total_amount?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          accent_color: string
          business_id: string
          created_at: string
          created_by: string | null
          default_notes: string | null
          default_terms: string | null
          footer_text: string | null
          id: string
          show_amount_in_words: boolean
          show_signature: boolean
          show_upi_qr: boolean
          signature_label: string | null
          template: string
          updated_at: string
          upi_id: string | null
          upi_payee_name: string | null
        }
        Insert: {
          accent_color?: string
          business_id: string
          created_at?: string
          created_by?: string | null
          default_notes?: string | null
          default_terms?: string | null
          footer_text?: string | null
          id?: string
          show_amount_in_words?: boolean
          show_signature?: boolean
          show_upi_qr?: boolean
          signature_label?: string | null
          template?: string
          updated_at?: string
          upi_id?: string | null
          upi_payee_name?: string | null
        }
        Update: {
          accent_color?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          default_notes?: string | null
          default_terms?: string | null
          footer_text?: string | null
          id?: string
          show_amount_in_words?: boolean
          show_signature?: boolean
          show_upi_qr?: boolean
          signature_label?: string | null
          template?: string
          updated_at?: string
          upi_id?: string | null
          upi_payee_name?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          balance_amount: number
          branch_id: string | null
          business_id: string
          cgst_amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount_amount: number
          due_date: string | null
          extra_discount: number
          id: string
          igst_amount: number
          invoice_date: string
          invoice_number: string
          is_gst: boolean
          is_inter_state: boolean
          is_online_order: boolean
          notes: string | null
          paid_amount: number
          party_id: string | null
          party_state_code: string | null
          pos_session_id: string | null
          round_off: number
          sgst_amount: number
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          terms: string | null
          total_amount: number
          type: Database["public"]["Enums"]["invoice_type"]
          updated_at: string
        }
        Insert: {
          balance_amount?: number
          branch_id?: string | null
          business_id: string
          cgst_amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number
          due_date?: string | null
          extra_discount?: number
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number: string
          is_gst?: boolean
          is_inter_state?: boolean
          is_online_order?: boolean
          notes?: string | null
          paid_amount?: number
          party_id?: string | null
          party_state_code?: string | null
          pos_session_id?: string | null
          round_off?: number
          sgst_amount?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          terms?: string | null
          total_amount?: number
          type?: Database["public"]["Enums"]["invoice_type"]
          updated_at?: string
        }
        Update: {
          balance_amount?: number
          branch_id?: string | null
          business_id?: string
          cgst_amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number
          due_date?: string | null
          extra_discount?: number
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number?: string
          is_gst?: boolean
          is_inter_state?: boolean
          is_online_order?: boolean
          notes?: string | null
          paid_amount?: number
          party_id?: string | null
          party_state_code?: string | null
          pos_session_id?: string | null
          round_off?: number
          sgst_amount?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          terms?: string | null
          total_amount?: number
          type?: Database["public"]["Enums"]["invoice_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          barcode: string | null
          brand: string | null
          business_id: string
          catalog_id: string | null
          category_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          current_stock: number
          description: string | null
          flavour: string | null
          hsn_code: string | null
          id: string
          image_url: string | null
          is_batch_tracked: boolean
          low_stock_alert: number
          mrp: number | null
          name: string
          opening_stock: number
          purchase_price: number
          sale_price: number
          sku: string | null
          tax_rate: number
          type: Database["public"]["Enums"]["item_type"]
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          business_id: string
          catalog_id?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          description?: string | null
          flavour?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_batch_tracked?: boolean
          low_stock_alert?: number
          mrp?: number | null
          name: string
          opening_stock?: number
          purchase_price?: number
          sale_price?: number
          sku?: string | null
          tax_rate?: number
          type?: Database["public"]["Enums"]["item_type"]
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          business_id?: string
          catalog_id?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          description?: string | null
          flavour?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_batch_tracked?: boolean
          low_stock_alert?: number
          mrp?: number | null
          name?: string
          opening_stock?: number
          purchase_price?: number
          sale_price?: number
          sku?: string | null
          tax_rate?: number
          type?: Database["public"]["Enums"]["item_type"]
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "barcode_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          amount_per_point: number
          business_id: string
          created_at: string
          enabled: boolean
          min_redeem_points: number
          point_value: number
          updated_at: string
        }
        Insert: {
          amount_per_point?: number
          business_id: string
          created_at?: string
          enabled?: boolean
          min_redeem_points?: number
          point_value?: number
          updated_at?: string
        }
        Update: {
          amount_per_point?: number
          business_id?: string
          created_at?: string
          enabled?: boolean
          min_redeem_points?: number
          point_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          party_id: string
          points_earned: number
          points_redeemed: number
          redeem_value: number
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          party_id: string
          points_earned?: number
          points_redeemed?: number
          redeem_value?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          party_id?: string
          points_earned?: number
          points_redeemed?: number
          redeem_value?: number
        }
        Relationships: []
      }
      parties: {
        Row: {
          billing_address: string | null
          business_id: string
          created_at: string
          created_by: string | null
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          opening_balance: number
          phone: string | null
          shipping_address: string | null
          state: string | null
          state_code: string | null
          supplies: string | null
          type: Database["public"]["Enums"]["party_type"]
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          shipping_address?: string | null
          state?: string | null
          state_code?: string | null
          supplies?: string | null
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          shipping_address?: string | null
          state?: string | null
          state_code?: string | null
          supplies?: string | null
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          business_id: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          invoice_ids: string[]
          message: string | null
          party_id: string
          recipient_email: string | null
          sent_at: string | null
          status: string
          total_overdue: number
        }
        Insert: {
          business_id: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_ids?: string[]
          message?: string | null
          party_id: string
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          total_overdue?: number
        }
        Update: {
          business_id?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_ids?: string[]
          message?: string | null
          party_id?: string
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          total_overdue?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          id: string
          invoice_id: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          party_id: string | null
          payment_date: string
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          party_id?: string | null
          payment_date?: string
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["payment_direction"]
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          party_id?: string | null
          payment_date?: string
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      pos_held_carts: {
        Row: {
          business_id: string
          cart: Json
          created_at: string
          created_by: string
          id: string
          label: string | null
          party_id: string | null
        }
        Insert: {
          business_id: string
          cart: Json
          created_at?: string
          created_by: string
          id?: string
          label?: string | null
          party_id?: string | null
        }
        Update: {
          business_id?: string
          cart?: Json
          created_at?: string
          created_by?: string
          id?: string
          label?: string | null
          party_id?: string | null
        }
        Relationships: []
      }
      pos_sessions: {
        Row: {
          business_id: string
          closed_at: string | null
          closing_cash: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
        }
        Insert: {
          business_id: string
          closed_at?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
        }
        Update: {
          business_id?: string
          closed_at?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
        }
        Relationships: []
      }
      pos_user_access: {
        Row: {
          business_id: string
          created_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_module_access: {
        Row: {
          business_id: string
          created_at: string
          id: string
          modules: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          modules?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          modules?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
          quantity: number
          reference_id: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          warehouse_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          quantity: number
          reference_id?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          warehouse_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          type?: Database["public"]["Enums"]["stock_movement_type"]
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _business_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_business_member: {
        Args: { _business_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "staff" | "accountant" | "admin"
      invoice_status:
        | "draft"
        | "unpaid"
        | "partial"
        | "paid"
        | "overdue"
        | "cancelled"
      invoice_type:
        | "sale"
        | "purchase"
        | "sale_return"
        | "purchase_return"
        | "quotation"
        | "credit_note"
        | "debit_note"
      item_type: "product" | "service"
      party_type: "customer" | "supplier"
      payment_direction: "in" | "out"
      payment_method: "cash" | "bank" | "upi" | "cheque" | "card" | "other"
      stock_movement_type:
        | "opening"
        | "purchase"
        | "sale"
        | "adjustment_in"
        | "adjustment_out"
        | "damage"
        | "transfer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "staff", "accountant", "admin"],
      invoice_status: [
        "draft",
        "unpaid",
        "partial",
        "paid",
        "overdue",
        "cancelled",
      ],
      invoice_type: [
        "sale",
        "purchase",
        "sale_return",
        "purchase_return",
        "quotation",
        "credit_note",
        "debit_note",
      ],
      item_type: ["product", "service"],
      party_type: ["customer", "supplier"],
      payment_direction: ["in", "out"],
      payment_method: ["cash", "bank", "upi", "cheque", "card", "other"],
      stock_movement_type: [
        "opening",
        "purchase",
        "sale",
        "adjustment_in",
        "adjustment_out",
        "damage",
        "transfer",
      ],
    },
  },
} as const
