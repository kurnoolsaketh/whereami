package where.am.i.mvp.server;

import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.Level;
import where.am.i.mvp.entities.Pipeline;
import where.am.i.mvp.entities.User;

import java.io.IOException;
import java.util.*;

// tracks applicants, their pipelines, and their stages for the jobs they applied to (user perspective)
// TODO: should be a database
public class ApplicantService {
    Map<User, Map<Job, Pipeline>> applicantToPipelines;

    public ApplicantService() {
        this.applicantToPipelines = new HashMap<>();
    }

    public void addApplied(User user, Job job, Level level) throws IOException {
        applicantToPipelines.computeIfAbsent(user, u -> new HashMap<>());
        var jobToPipeline = applicantToPipelines.get(user);
        if (jobToPipeline.containsKey(job)) {
            throw new IOException("User [%s] already applied to job [%s]".formatted(user.userId(), job));
        }
        jobToPipeline.put(job, new Pipeline(level, job.getId()));
    }

    public void updateStatus(User user, Job job, Pipeline.Status newStatus) throws IOException {
        // without this an empty body, or {"newStatus": null}, silently sets status to null,
        // which then serializes as null and makes every screen think the application is neither
        // active nor ended. every other mutator here validates; this one used to be the gap
        if (newStatus == null) {
            throw new IOException("newStatus is required");
        }
        var jobToPipeline = applicantToPipelines.get(user);
        if (jobToPipeline == null) {
            throw new IOException("User [%s] has not applied to any jobs".formatted(user.userId()));
        }
        if (!jobToPipeline.containsKey(job)) {
            throw new IOException("User [%s] has not applied to job [%s]".formatted(user.userId(), job));
        }
        jobToPipeline.get(job).updateStatus(newStatus);
    }

    public void removeApplicant(User user, Job job) {
        var jobToPipeline = applicantToPipelines.get(user);
        if (jobToPipeline != null) {
            jobToPipeline.remove(job);
        }
    }

    public void updateStages(User user, Job job, List<Pipeline.Stage> stages, int newPos) throws IOException {
        var jobToPipeline = applicantToPipelines.get(user);
        if (jobToPipeline == null) {
            throw new IOException("User [%s] has not applied to any jobs".formatted(user.userId()));
        }
        if (!jobToPipeline.containsKey(job)) {
            throw new IOException("User [%s] has not applied to job [%s]".formatted(user.userId(), job));
        }
        jobToPipeline.get(job).updateStages(stages, newPos);
    }

    public void moveToNextStage(User user, Job job) throws IOException {
        var jobToPipeline = applicantToPipelines.get(user);
        if (jobToPipeline == null) {
            throw new IOException("User [%s] has not applied to any jobs - can't move to next stage".formatted(user.userId()));
        }
        Pipeline pipeline = jobToPipeline.get(job);
        if (pipeline == null) {
            throw new IOException("User has not applied to the [%s] role at [%s] or has been removed".formatted(job.role().name(), job.company().name()));
        }
        int currentPos = pipeline.getCurrentStagePosition();
        pipeline.moveToStage(currentPos+1);
    }

    public void moveToStage(User user, Job job, int newPos) throws IOException {
        var jobToPipeline = applicantToPipelines.get(user);
        if (jobToPipeline == null) {
            throw new IOException("User [%s] has not applied to any jobs - can't update stage".formatted(user.userId()));
        }
        Pipeline pipeline = jobToPipeline.get(job);
        if (pipeline == null) {
            throw new IOException("User has not applied to the [%s] role at [%s] or has been removed".formatted(job.role().name(), job.company().name()));
        }
        pipeline.moveToStage(newPos);
    }

    public Pipeline getPipeline(User user, Job job) throws IOException {
        var jobToPipeline = applicantToPipelines.get(user);
        if (jobToPipeline == null) {
            throw new IOException("User [%s] has not applied to any jobs".formatted(user.userId()));
        }
        Pipeline pipeline = jobToPipeline.get(job);
        if (pipeline == null) {
            throw new IOException("User has not applied to the [%s] role at [%s] or has been removed".formatted(job.role().name(), job.company().name()));
        }
        return pipeline;
    }

    public Set<Job> listAppliedJobs(User user) {
        var jobToPipeline = applicantToPipelines.get(user);
        if (jobToPipeline == null) {
            return Collections.emptySet();
        }
        return jobToPipeline.keySet();
    }

    public Set<User> listUsers() {
        return applicantToPipelines.keySet();
    }
}
