CREATE TABLE "styles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "styles_slug_uniq" ON "styles" USING btree ("slug");--> statement-breakpoint
CREATE TABLE "post_styles" (
	"post_id" text NOT NULL,
	"style_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_styles_post_id_style_id_pk" PRIMARY KEY("post_id","style_id")
);
--> statement-breakpoint
ALTER TABLE "post_styles" ADD CONSTRAINT "post_styles_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_styles" ADD CONSTRAINT "post_styles_style_id_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_styles_style_idx" ON "post_styles" USING btree ("style_id");
