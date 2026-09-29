export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrganizationRole = 'ADMIN' | 'MEMBER';
export type ProjectStatus = 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
export type MediaAssetStatus =
  | 'PENDING'
  | 'UPLOADED'
  | 'ANALYZING'
  | 'ANALYZED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVIEWED'
  | 'FAILED';
export type ReviewAction = 'APPROVED' | 'REJECTED' | 'FLAGGED' | 'MODIFIED';

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrganizationRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: OrganizationRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          location: string | null;
          start_date: string | null;
          end_date: string | null;
          status: ProjectStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          location?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          status?: ProjectStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          location?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          status?: ProjectStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      media_assets: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string | null;
          cloudinary_public_id: string;
          cloudinary_url: string;
          resource_type: string;
          original_filename: string;
          mime_type: string | null;
          file_size: number | null;
          width: number | null;
          height: number | null;
          title: string | null;
          description: string | null;
          activity: string | null;
          location: string | null;
          captured_at: string | null;
          tags: string[];
          status: MediaAssetStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id?: string | null;
          cloudinary_public_id: string;
          cloudinary_url: string;
          resource_type?: string;
          original_filename: string;
          mime_type?: string | null;
          file_size?: number | null;
          width?: number | null;
          height?: number | null;
          title?: string | null;
          description?: string | null;
          activity?: string | null;
          location?: string | null;
          captured_at?: string | null;
          tags?: string[];
          status?: MediaAssetStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string | null;
          cloudinary_public_id?: string;
          cloudinary_url?: string;
          resource_type?: string;
          original_filename?: string;
          mime_type?: string | null;
          file_size?: number | null;
          width?: number | null;
          height?: number | null;
          title?: string | null;
          description?: string | null;
          activity?: string | null;
          location?: string | null;
          captured_at?: string | null;
          tags?: string[];
          status?: MediaAssetStatus;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_assets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          }
        ];
      };
      ai_analyses: {
        Row: {
          id: string;
          media_asset_id: string;
          model: string;
          description: string | null;
          suggested_activity: string | null;
          suggested_location: string | null;
          suggested_project_id: string | null;
          objects: Json;
          environmental_signals: Json;
          tags: string[];
          confidence: number | null;
          raw_response: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          media_asset_id: string;
          model: string;
          description?: string | null;
          suggested_activity?: string | null;
          suggested_location?: string | null;
          suggested_project_id?: string | null;
          objects?: Json;
          environmental_signals?: Json;
          tags?: string[];
          confidence?: number | null;
          raw_response?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          media_asset_id?: string;
          model?: string;
          description?: string | null;
          suggested_activity?: string | null;
          suggested_location?: string | null;
          suggested_project_id?: string | null;
          objects?: Json;
          environmental_signals?: Json;
          tags?: string[];
          confidence?: number | null;
          raw_response?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_analyses_media_asset_id_fkey";
            columns: ["media_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          }
        ];
      };
      media_reviews: {
        Row: {
          id: string;
          media_asset_id: string;
          reviewed_by: string;
          action: ReviewAction;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          media_asset_id: string;
          reviewed_by: string;
          action: ReviewAction;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          media_asset_id?: string;
          reviewed_by?: string;
          action?: ReviewAction;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_reviews_media_asset_id_fkey";
            columns: ["media_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
