package where.am.i.mvp.server;

import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.Pipeline;
import where.am.i.mvp.entities.User;

import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

public class PipelineService {
    HashMap<Job, Set<User>> jobToApplicants;

    public PipelineService() {
        this.jobToApplicants = new HashMap<>();
    }

    public void addApplicant(User user, Job job) {
        user.addJob(job);
        jobToApplicants.computeIfAbsent(job, j -> new HashSet<>());
        jobToApplicants.get(job).add(user);
    }

    public void removeApplicant(User user, Job job) throws IOException {
        user.removeJob(job);
        jobToApplicants.get(job).remove(user);
    }

    public Set<User> getApplicants(Job job) {
        return jobToApplicants.getOrDefault(job, Collections.emptySet());
    }

    public Set<User> getApplicantsAtStage(Job job, Pipeline.Stage stage) {
        if (!jobToApplicants.containsKey(job)) {
            return Collections.emptySet();
        }
        Set<User> users = jobToApplicants.get(job);
        return users.stream().filter(user -> {
            try {
                return user.getPipeline(job).getCurrentStage() == stage;
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }).collect(Collectors.toSet());
    }

    public void updateStages(User user, Job job, List<Pipeline.Stage> stages, int newPos) throws IOException {
        user.getPipeline(job).updateStages(stages, newPos);
    }

    public void moveToNextStage(User user, Job job) throws IOException {
        Pipeline pipeline = user.getPipeline(job);
        int currentPos = pipeline.getCurrentStagePosition();
        user.getPipeline(job).moveToStage(currentPos+1);
    }

    public void moveToStage(User user, Job job, int newPos) throws IOException {
        user.getPipeline(job).moveToStage(newPos);
    }
}
