-- DropForeignKey
ALTER TABLE "student_records" DROP CONSTRAINT "student_records_organization_id_fkey";

-- AddForeignKey
ALTER TABLE "student_records" ADD CONSTRAINT "student_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE reporter_profiles ADD CONSTRAINT reporter_score_range CHECK (score BETWEEN 0 AND 100);
ALTER TABLE reporter_score_entries ADD CONSTRAINT reporter_entry_score_range CHECK (score_before BETWEEN 0 AND 100 AND score_after BETWEEN 0 AND 100 AND delta=score_after-score_before);
