package where.am.i.mvp.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.User;
import where.am.i.mvp.server.JobRegistry;
import where.am.i.mvp.server.PipelineService;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/jobs")
public class JobController {
    private final JobRegistry jobRegistry;
    private final PipelineService pipelineService;

    public JobController(JobRegistry jobRegistry, PipelineService pipelineService) {
        this.jobRegistry = jobRegistry;
        this.pipelineService = pipelineService;
    }

    @GetMapping
    public List<JobResponse> listJobs() {
        return jobRegistry.listJobs().stream()
                .map(JobResponse::from)
                .sorted(JobResponse.BY_COMPANY_THEN_TITLE)
                .toList();
    }

    @PostMapping
    public JobResponse createJob(@RequestBody CreateJobRequest request)
            throws NoSuchAlgorithmException, IOException {
        String jobId = jobRegistry.createJob(
                request.title(), request.company(), request.description(), request.reqId(),
                parseUrl(request.url()));
        return JobResponse.from(jobRegistry.getJob(jobId));
    }

    // IOException because that is how the rest of this codebase signals a rejected input, and
    // ApiExceptionHandler already turns it into a 400 with a message. left unguarded, a missing
    // url NPEs and a scheme-less one throws IllegalArgumentException, both of which reach the
    // client as a 500 with no body to explain it
    private static URL parseUrl(String url) throws IOException {
        if (url == null || url.isBlank()) {
            throw new IOException("url is required");
        }
        try {
            return new URI(url).toURL();
        } catch (URISyntaxException | IllegalArgumentException e) {
            throw new IOException("url is not a valid absolute URL: " + url);
        }
    }

    @GetMapping("/{jobId}")
    public JobResponse getJob(@PathVariable String jobId) throws IOException {
        return JobResponse.from(jobRegistry.getJob(jobId));
    }

    @GetMapping("/{jobId}/applicants")
    public List<ApplicantResponse> listApplicants(@PathVariable String jobId) throws IOException {
        Job job = jobRegistry.getJob(jobId);
        List<ApplicantResponse> applicants = new ArrayList<>();
        for (User applicant : pipelineService.getApplicants(job)) {
            applicants.add(ApplicantResponse.from(applicant, applicant.getPipeline(job)));
        }
        return applicants.stream().sorted(ApplicantResponse.BY_USER_ID).toList();
    }
}
