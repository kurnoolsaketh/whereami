package where.am.i.mvp.api;

import where.am.i.mvp.entities.Job;

import java.util.Comparator;

public record JobResponse(String jobId, String title, String company, String description, String reqId) {

    // the registries iterate HashMaps keyed by entities without hashCode, so order varies per
    // run - every list the api returns is sorted here instead
    public static final Comparator<JobResponse> BY_COMPANY_THEN_TITLE =
            Comparator.comparing(JobResponse::company).thenComparing(JobResponse::title);

    public static JobResponse from(Job job) {
        return new JobResponse(job.getId(), job.getTitle(), job.getCompany(), job.getDescription(), job.getReqId());
    }
}
