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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          created_at: string
          desired_arrival: string | null
          id: string
          passenger_id: string
          pickup_eta: string | null
          pickup_lat: number
          pickup_lng: number
          price_dh: number
          ride_km: number
          status: Database["public"]["Enums"]["booking_status"]
          travel_date: string
          trip_id: string
          walk_meters: number
        }
        Insert: {
          created_at?: string
          desired_arrival?: string | null
          id?: string
          passenger_id: string
          pickup_eta?: string | null
          pickup_lat: number
          pickup_lng: number
          price_dh?: number
          ride_km: number
          status?: Database["public"]["Enums"]["booking_status"]
          travel_date: string
          trip_id: string
          walk_meters: number
        }
        Update: {
          created_at?: string
          desired_arrival?: string | null
          id?: string
          passenger_id?: string
          pickup_eta?: string | null
          pickup_lat?: number
          pickup_lng?: number
          price_dh?: number
          ride_km?: number
          status?: Database["public"]["Enums"]["booking_status"]
          travel_date?: string
          trip_id?: string
          walk_meters?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          booking_id: string | null
          created_at: string
          id: string
          kind: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          kind: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          avatar_url: string | null
          created_at: string
          first_name: string
          id: string
          language: string
          major: string | null
          rating_avg: number
          rating_count: number
          verified: boolean
        }
        Insert: {
          account_type?: string
          avatar_url?: string | null
          created_at?: string
          first_name?: string
          id: string
          language?: string
          major?: string | null
          rating_avg?: number
          rating_count?: number
          verified?: boolean
        }
        Update: {
          account_type?: string
          avatar_url?: string | null
          created_at?: string
          first_name?: string
          id?: string
          language?: string
          major?: string | null
          rating_avg?: number
          rating_count?: number
          verified?: boolean
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author_id: string
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          target_id: string
        }
        Insert: {
          author_id: string
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          target_id: string
        }
        Update: {
          author_id?: string
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_events: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_positions: {
        Row: {
          booking_id: string
          created_at: string
          id: number
          lat: number
          lng: number
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: number
          lat: number
          lng: number
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: number
          lat?: number
          lng?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_positions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          active: boolean
          created_at: string
          departure_time: string
          dest_label: string
          dest_lat: number
          dest_lng: number
          driver_id: string
          id: string
          one_off_date: string | null
          origin_label: string
          origin_lat: number
          origin_lng: number
          route: Json
          route_km: number
          route_minutes: number
          seats: number
          vehicle_id: string | null
          weekdays: number[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          departure_time: string
          dest_label: string
          dest_lat: number
          dest_lng: number
          driver_id: string
          id?: string
          one_off_date?: string | null
          origin_label: string
          origin_lat: number
          origin_lng: number
          route?: Json
          route_km?: number
          route_minutes?: number
          seats?: number
          vehicle_id?: string | null
          weekdays?: number[]
        }
        Update: {
          active?: boolean
          created_at?: string
          departure_time?: string
          dest_label?: string
          dest_lat?: number
          dest_lng?: number
          driver_id?: string
          id?: string
          one_off_date?: string | null
          origin_label?: string
          origin_lat?: number
          origin_lng?: number
          route?: Json
          route_km?: number
          route_minutes?: number
          seats?: number
          vehicle_id?: string | null
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_contacts: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          phone?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          brand: string
          color: string
          created_at: string
          id: string
          owner_id: string
          plate: string
          seats: number
        }
        Insert: {
          brand: string
          color: string
          created_at?: string
          id?: string
          owner_id: string
          plate: string
          seats?: number
        }
        Update: {
          brand?: string
          color?: string
          created_at?: string
          id?: string
          owner_id?: string
          plate?: string
          seats?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_price: { Args: { km: number }; Returns: number }
      has_account_type: {
        Args: { _type: string; _user: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_booking_party: {
        Args: { _booking_id: string; _user: string }
        Returns: boolean
      }
      is_trip_driver: {
        Args: { _trip_id: string; _user: string }
        Returns: boolean
      }
      purge_old_data: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "student"
      booking_status: "confirmed" | "cancelled" | "in_progress" | "completed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "student"],
      booking_status: ["confirmed", "cancelled", "in_progress", "completed"],
    },
  },
} as const
