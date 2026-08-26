package where.am.i.mvp.api.response;

import where.am.i.mvp.entities.Job;

import java.util.Comparator;

public record JobResponse(String title, String company, String url, String role) {

    // the registries iterate HashMaps keyed by entities without hashCode, so order varies per
    // run - every list the api returns is sorted here instead
    public static final Comparator<JobResponse> BY_COMPANY_THEN_TITLE =
            Comparator.comparing(JobResponse::company).thenComparing(JobResponse::title);

    // a URL serializes to an object of its parts, so it goes over the wire as a string. the null
    // check is defence in depth - JobController.parseUrl rejects a missing url before a Job is
    // built - but this mapper runs over the whole list, so one bad Job would 500 every listJobs
    public static JobResponse from(Job job) {
        return new JobResponse(job.title(), job.company().name(), job.url() == null ? null : job.url().toString(), job.role().toString());
    }
}
