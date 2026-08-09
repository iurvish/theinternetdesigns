CREATE TABLE "industries" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "industries_slug_uniq" ON "industries" USING btree ("slug");--> statement-breakpoint
CREATE TABLE "post_industries" (
	"post_id" text NOT NULL,
	"industry_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_industries_post_id_industry_id_pk" PRIMARY KEY("post_id","industry_id")
);
--> statement-breakpoint
ALTER TABLE "post_industries" ADD CONSTRAINT "post_industries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_industries" ADD CONSTRAINT "post_industries_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_industries_industry_idx" ON "post_industries" USING btree ("industry_id");
