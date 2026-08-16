package where.am.i.mvp.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.User;
import where.am.i.mvp.server.JobRegistry;
import where.am.i.mvp.server.PipelineService;
import where.am.i.mvp.server.UserRegistry;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

// the jobs a user applied to, and where they are in each one
@RestController
@RequestMapping("/api/users/{userId}/applications")
public class PipelineController {
    private final UserRegistry userRegistry;
    private final JobRegistry jobRegistry;
    private final PipelineService pipelineService;

    public PipelineController(UserRegistry userRegistry,
                              JobRegistry jobRegistry,
                              PipelineService pipelineService) {
        this.userRegistry = userRegistry;
        this.jobRegistry = jobRegistry;
        this.pipelineService = pipelineService;
    }

    @GetMapping
    public List<ApplicationResponse> listApplications(@PathVariable String userId) throws IOException {
        User user = userRegistry.getUser(userId);
        List<ApplicationResponse> applications = new ArrayList<>();
        for (Job job : user.getActiveJobs()) {
            applications.add(ApplicationResponse.from(job, user.getPipeline(job)));
        }
        return applications.stream().sorted(ApplicationResponse.BY_COMPANY_THEN_TITLE).toList();
    }

    @PostMapping
    public ApplicationResponse apply(@PathVariable String userId,
                                     @RequestBody ApplyRequest request) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(request.jobId());
        pipelineService.addApplicant(user, job);
        return ApplicationResponse.from(job, user.getPipeline(job));
    }

    @DeleteMapping("/{jobId}")
    public ResponseEntity<Void> withdraw(@PathVariable String userId,
                                         @PathVariable String jobId) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        pipelineService.removeApplicant(user, job);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{jobId}/stages")
    public ApplicationResponse updateStages(@PathVariable String userId,
                                            @PathVariable String jobId,
                                            @RequestBody UpdateStagesRequest request) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        pipelineService.updateStages(user, job, request.stages(), request.currentStagePosition());
        return ApplicationResponse.from(job, user.getPipeline(job));
    }

    @PutMapping("/{jobId}/position")
    public ApplicationResponse moveToStage(@PathVariable String userId,
                                           @PathVariable String jobId,
                                           @RequestBody MoveToStageRequest request) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        pipelineService.moveToStage(user, job, request.currentStagePosition());
        return ApplicationResponse.from(job, user.getPipeline(job));
    }

    @PostMapping("/{jobId}/next")
    public ApplicationResponse moveToNextStage(@PathVariable String userId,
                                               @PathVariable String jobId) throws IOException {
        User user = userRegistry.getUser(userId);
        Job job = jobRegistry.getJob(jobId);
        pipelineService.moveToNextStage(user, job);
        return ApplicationResponse.from(job, user.getPipeline(job));
    }
}
