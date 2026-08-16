package where.am.i.mvp.api;

import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.Pipeline;

import java.util.Comparator;

// one job a user applied to, and where they are in it
public record ApplicationResponse(JobResponse job, PipelineResponse pipeline) {

    public static final Comparator<ApplicationResponse> BY_COMPANY_THEN_TITLE =
            Comparator.comparing(ApplicationResponse::job, JobResponse.BY_COMPANY_THEN_TITLE);

    public static ApplicationResponse from(Job job, Pipeline pipeline) {
        return new ApplicationResponse(JobResponse.from(job), PipelineResponse.from(pipeline));
    }
}
