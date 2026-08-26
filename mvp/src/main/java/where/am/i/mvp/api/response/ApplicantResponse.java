package where.am.i.mvp.api.response;

import where.am.i.mvp.entities.Pipeline;
import where.am.i.mvp.entities.User;

import java.util.Comparator;

// one applicant on a job, and where they are in it. the requesting user is in this list too -
// there is no auth to exclude them by, and the UI marks which row is theirs
public record ApplicantResponse(UserResponse user, PipelineResponse pipeline) {

    public static final Comparator<ApplicantResponse> BY_USER_ID =
            Comparator.comparing(applicant -> applicant.user().userId());

    public static ApplicantResponse from(User user, Pipeline pipeline) {
        return new ApplicantResponse(UserResponse.from(user), PipelineResponse.from(pipeline));
    }
}
