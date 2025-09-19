
CREATE TABLE IF NOT EXISTS "priority_emails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "priority_emails_user_email_unique" UNIQUE("user_id","email")
);

DO $$ BEGIN
 ALTER TABLE "priority_emails" ADD CONSTRAINT "priority_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
