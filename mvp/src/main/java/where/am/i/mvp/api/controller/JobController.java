package where.am.i.mvp.api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.api.request.CreateJobRequest;
import where.am.i.mvp.api.response.JobResponse;
import where.am.i.mvp.entities.*;
import where.am.i.mvp.server.CompanyRegistry;
import where.am.i.mvp.server.JobRegistry;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/jobs")
public class JobController {
    private final JobRegistry jobRegistry;
    private final CompanyRegistry companyRegistry;

    public JobController(JobRegistry jobRegistry, CompanyRegistry companyRegistry) {
        this.jobRegistry = jobRegistry;
        this.companyRegistry = companyRegistry;
    }

    @GetMapping("/companies")
    public List<String> listCompanies() {
        return jobRegistry.listCompanies().stream()
                .map(Company::name)
                .sorted()
                .toList();
    }


    @GetMapping("/{company}/list")
    public List<JobResponse> listJobs(@PathVariable String company) {
        if (!companyRegistry.exists(company)) {
            return Collections.emptyList();
        }
        return jobRegistry.listJobs(new Company(company)).stream()
                .map(JobResponse::from)
                .sorted(JobResponse.BY_COMPANY_THEN_TITLE)
                .toList();
    }

    @GetMapping("/{company}/{role}/list")
    public List<JobResponse> listJobsForRoleAndCompany(@PathVariable String company, @PathVariable String role) {
        if (!companyRegistry.exists(company)) {
            return Collections.emptyList();
        }
        return jobRegistry.listJobsForRoleAndCompany(new Company(company), Role.valueOf(role)).stream()
                .map(JobResponse::from)
                .sorted(JobResponse.BY_COMPANY_THEN_TITLE)
                .toList();
    }

    @PostMapping("/new")
    public JobResponse createJob(@PathVariable String company, @RequestBody CreateJobRequest request) throws IOException {
        if (!companyRegistry.exists(company)) {
            companyRegistry.newCompany(company);
        }
        Job job = jobRegistry.createJob(request.title(), new Company(company), parseUrl(request.url()), Role.valueOf(request.role()));
        return JobResponse.from(job);
    }

    @GetMapping("/{jobId}")
    public JobResponse getJob(@PathVariable String jobId) throws IOException {
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
}
