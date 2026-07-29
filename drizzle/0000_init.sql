CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'gif');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('x', 'threads', 'instagram', 'linkedin', 'dribbble', 'behance');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "source" DEFAULT 'x' NOT NULL,
	"source_id" text NOT NULL,
	"username" varchar(100) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"avatar_url" text,
	"bio" text,
	"profile_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"original_url" text NOT NULL,
	"medium_url" text,
	"thumbnail_url" text,
	"poster_url" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"source_media_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_categories" (
	"post_id" text NOT NULL,
	"category_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_categories_post_id_category_id_pk" PRIMARY KEY("post_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "source" DEFAULT 'x' NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text NOT NULL,
	"creator_id" text NOT NULL,
	"title" varchar(300),
	"caption" text,
	"raw_text" text,
	"provider_meta" jsonb,
	"published_at" timestamp with time zone,
	"has_video" boolean DEFAULT false NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"search_tokens" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uniq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_source_source_id_uniq" ON "creators" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_source_username_uniq" ON "creators" USING btree ("source","username");--> statement-breakpoint
CREATE INDEX "creators_username_idx" ON "creators" USING btree ("username");--> statement-breakpoint
CREATE INDEX "media_post_idx" ON "media" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "post_categories_category_idx" ON "post_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_source_source_id_uniq" ON "posts" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "posts_creator_idx" ON "posts" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "posts_published_at_idx" ON "posts" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_published_idx" ON "posts" USING btree ("published");