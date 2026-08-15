package where.am.i.mvp;

import where.am.i.mvp.entities.Pipeline;
import where.am.i.mvp.entities.User;
import where.am.i.mvp.entities.Job;
import where.am.i.mvp.server.PipelineController;
import where.am.i.mvp.server.UserRegistry;
import where.am.i.mvp.server.JobRegistry;

import java.io.IOException;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Set;

// each Client is scoped to a User
public class Client {
    JobRegistry jobRegistry;
    UserRegistry userRegistry;
    PipelineController pipelineController;

    public Client(JobRegistry jobRegistry, UserRegistry userRegistry, PipelineController pipelineController) {
        this.jobRegistry = jobRegistry;
        this.userRegistry = userRegistry;
        this.pipelineController = pipelineController;
    }

    // Pipeline
    public void addApplicant(User user, Job job) {
        pipelineController.addApplicant(user, job);
    }

    public void removeApplicant(User user, Job job) throws IOException {
        pipelineController.removeApplicant(user, job);
    }

    public void updateStages(User user, Job job, List<Pipeline.Stage> stages) throws IOException {
        pipelineController.updateStages(user, job, stages);
    }

    public void moveToNextStage(User user, Job job) throws IOException {
        pipelineController.moveToNextStage(user, job);
    }

    public void moveToStage(User user, Job job, int newPos) throws IOException {
        pipelineController.moveToStage(user, job, newPos);
    }

    public Set<User> getApplicants(Job job) {
        return pipelineController.getApplicants(job);
    }

    public Set<User> getApplicantsAtStage(Job job, Pipeline.Stage stage) {
        return pipelineController.getApplicantsAtStage(job, stage);
    }

    // Job accessors
    public String createJob(String title,
                         String company,
                         String description,
                         String reqId) throws NoSuchAlgorithmException, IOException {
        return jobRegistry.createJob(title, company, description, reqId);
    }

    public Job getJob(String jobId) throws IOException {
        return jobRegistry.getJob(jobId);
    }

    // Applicant accessors
    public User createUser(String firstName, String lastName, String userId) throws IOException {
        return userRegistry.createUser(firstName, lastName, userId);
    }

    public User getUser(String userId) throws IOException {
        return userRegistry.getUser(userId);
    }
}
