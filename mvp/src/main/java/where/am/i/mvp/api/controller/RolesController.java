package where.am.i.mvp.api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.api.response.ApplicantResponse;
import where.am.i.mvp.api.response.JobResponse;
import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.Role;
import where.am.i.mvp.entities.User;
import where.am.i.mvp.server.ApplicantService;
import where.am.i.mvp.server.CompanyRegistry;
import where.am.i.mvp.server.JobRegistry;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/roles")
public class RolesController {
    private final JobRegistry jobRegistry;
    private final CompanyRegistry companyRegistry;
    private final ApplicantService applicantService;

    public RolesController(JobRegistry jobRegistry, CompanyRegistry companyRegistry, ApplicantService applicantService) {
        this.jobRegistry = jobRegistry;
        this.companyRegistry = companyRegistry;
        this.applicantService = applicantService;
    }

    @GetMapping
    public List<String> listAllRoles() {
        return Arrays.stream(Role.values()).map(Role::toString).toList();
    }

    @GetMapping("/{company}")
    public Set<String> listAllRolesUsersAppliedToForCompany(@PathVariable String company) throws IOException {
        return jobRegistry.listJobs(companyRegistry.getOrThrow(company)).stream().map(job -> job.role().toString()).collect(Collectors.toSet());
    }

    @GetMapping("/{role}/jobs")
    public List<JobResponse> listJobsForRole(@PathVariable String role) {
        return jobRegistry.listJobsForRole(Role.valueOf(role)).stream().map(JobResponse::from).toList();
    }

    // TODO: separate endpoint for level?
    @GetMapping("/{role}/{company}/applicants")
    public List<ApplicantResponse> listApplicantsForRoleAndCompany(@PathVariable String role, @PathVariable String company) throws IOException {
        List<ApplicantResponse> applicants = new ArrayList<>();
        for (User user : applicantService.listUsers()) {
            Set<Job> jobs = applicantService.listAppliedJobs(user);
            for (Job job : jobs) {
                if (job.role().equals(Role.valueOf(role)) && job.company().equals(companyRegistry.getOrThrow(company))) {
                    applicants.add(ApplicantResponse.from(user, applicantService.getPipeline(user, job)));
                }
            }
        }
        return applicants;
    }
}
