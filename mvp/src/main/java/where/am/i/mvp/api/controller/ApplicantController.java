package where.am.i.mvp.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.api.request.UpdateStatusRequest;
import where.am.i.mvp.api.response.ApplicationResponse;
import where.am.i.mvp.api.request.ApplyRequest;
import where.am.i.mvp.api.request.MoveToStageRequest;
import where.am.i.mvp.api.request.UpdateStagesRequest;
import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.Level;
import where.am.i.mvp.entities.User;
import where.am.i.mvp.server.JobRegistry;
import where.am.i.mvp.server.ApplicantService;
import where.am.i.mvp.server.UserRegistry;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

// the jobs a user applied to, and where they are in each one
@RestController
@RequestMapping("/api/users/{userId}")
public class ApplicantController {
    private final UserRegistry userRegistry;
    private final JobRegistry jobRegistry;
    private final ApplicantService applicantService;

    public ApplicantController(UserRegistry userRegistry,
                               JobRegistry jobRegistry,
                               ApplicantService applicantService) {
        this.userRegistry = userRegistry;
        this.jobRegistry = jobRegistry;
        this.applicantService = applicantService;
    }

    @PostMapping("/apply")
    public ApplicationResponse apply(@PathVariable String userId,
                                     @RequestBody ApplyRequest request) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(request.jobId());
        applicantService.addApplied(user, job, request.level());
        return ApplicationResponse.from(job, applicantService.getPipeline(user, job));
    }

    @GetMapping("/applied")
    public List<ApplicationResponse> listAppliedJobs(@PathVariable String userId) throws IOException {
        User user = userRegistry.getUser(userId);
        List<ApplicationResponse> applications = new ArrayList<>();
        for (Job job : applicantService.listAppliedJobs(user)) {
            applications.add(ApplicationResponse.from(job, applicantService.getPipeline(user, job)));
        }
        return applications.stream().sorted(ApplicationResponse.BY_COMPANY_THEN_TITLE).toList();
    }

    @PutMapping("/applied/{jobId}/updateStages")
    public ApplicationResponse updateStages(@PathVariable String userId,
                                            @PathVariable String jobId,
                                            @RequestBody UpdateStagesRequest request) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        applicantService.updateStages(user, job, request.stages(), request.currentStagePosition());
        return ApplicationResponse.from(job, applicantService.getPipeline(user, job));
    }

    @PutMapping("/applied/{jobId}/updateStatus")
    public ApplicationResponse updateStatus(@PathVariable String userId,
                                            @PathVariable String jobId,
                                            @RequestBody UpdateStatusRequest request) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        applicantService.updateStatus(user, job, request.newStatus());
        return ApplicationResponse.from(job, applicantService.getPipeline(user, job));
    }

    @DeleteMapping("/applied/{jobId}")
    public ResponseEntity<Void> withdraw(@PathVariable String userId,
                                         @PathVariable String jobId) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        applicantService.removeApplicant(user, job);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/applied/{jobId}/moveToStage")
    public ApplicationResponse moveToStage(@PathVariable String userId,
                                           @PathVariable String jobId,
                                           @RequestBody MoveToStageRequest request) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        applicantService.moveToStage(user, job, request.currentStagePosition());
        return ApplicationResponse.from(job, applicantService.getPipeline(user, job));
    }

    @PostMapping("/applied/{jobId}/moveToNextStage")
    public ApplicationResponse moveToNextStage(@PathVariable String userId,
                                               @PathVariable String jobId) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        applicantService.moveToNextStage(user, job);
        return ApplicationResponse.from(job, applicantService.getPipeline(user, job));
    }
}
