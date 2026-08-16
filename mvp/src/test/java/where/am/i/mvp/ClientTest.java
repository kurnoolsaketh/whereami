package where.am.i.mvp;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.Pipeline;
import where.am.i.mvp.entities.User;
import where.am.i.mvp.server.JobRegistry;
import where.am.i.mvp.server.PipelineService;
import where.am.i.mvp.server.UserRegistry;

import java.io.IOException;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Set;

public class ClientTest {
    JobRegistry jobRegistry;
    UserRegistry userRegistry;
    PipelineService pipelineService;
    Client client;

    @BeforeEach
    public void setup() {
        pipelineService = new PipelineService();
        jobRegistry = new JobRegistry(pipelineService);
        userRegistry = new UserRegistry();
        client = new Client(jobRegistry, userRegistry, pipelineService);
    }

    @Test
    public void testSimpleCreateAndGetJob() throws NoSuchAlgorithmException, IOException {
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Assertions.assertNotNull(jobRegistry.getJob(id));
        Assertions.assertEquals(64, id.length());

        Job job = client.getJob(id);
        Assertions.assertEquals("swe at ass inc", job.getTitle());
        Assertions.assertEquals("bumco", job.getCompany());
        Assertions.assertEquals("yo mama", job.getDescription());
        Assertions.assertEquals("1234", job.getReqId());
    }

    @Test
    public void testGetJobNotExists() throws NoSuchAlgorithmException, IOException {
        Assertions.assertThrows(IOException.class, () -> client.getJob("x".repeat(64)));
    }

    @Test
    public void testGetJobMalformedId() throws NoSuchAlgorithmException, IOException {
        Assertions.assertThrows(IOException.class, () -> client.getJob("x"));
    }

    @Test
    public void testCreateJobAlreadyExists() throws NoSuchAlgorithmException, IOException {
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Assertions.assertThrows(IOException.class, () -> client.createJob("swe at ass inc", "bumco", "yo mama", "1234"));
    }

    @Test
    public void testSimpleCreateAndGetUser() throws IOException {
        client.createUser("yo", "mama", "bruh2000");

        var user = client.getUser("bruh2000");
        Assertions.assertEquals("yo", user.getFirstName());
        Assertions.assertEquals("mama", user.getLastName());
        Assertions.assertEquals("bruh2000", user.getUserId());
    }

    @Test
    public void testGetUserNotExists() throws IOException {
        Assertions.assertThrows(IOException.class, () -> client.getUser("bruh2000"));
    }

    @Test
    public void testSimpleAddAndRemoveApplicant() throws NoSuchAlgorithmException, IOException {
        User user = client.createUser("yo", "mama", "bruh2000");
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Job job = client.getJob(id);
        client.addApplicant(user, job);

        Assertions.assertTrue(client.getApplicants(job).contains(user));
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.APPLIED).contains(user));
        Assertions.assertEquals(Pipeline.Stage.APPLIED, user.getPipeline(job).getCurrentStage());

        client.removeApplicant(user, job);
        Assertions.assertFalse(client.getApplicants(job).contains(user));
        Assertions.assertFalse(client.getApplicantsAtStage(job, Pipeline.Stage.APPLIED).contains(user));
        Assertions.assertThrows(IOException.class, () -> user.getPipeline(job).getCurrentStage());
    }

    @Test
    public void testSimpleMoveToNextStage() throws NoSuchAlgorithmException, IOException {
        User user = client.createUser("yo", "mama", "bruh2000");
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Job job = client.getJob(id);
        client.addApplicant(user, job);
        client.updateStages(user, job, List.of(Pipeline.Stage.APPLIED, Pipeline.Stage.RECRUITER_SCREEN, Pipeline.Stage.HIRING_MANAGER_SCREEN, Pipeline.Stage.TECHNICAL_ROUND, Pipeline.Stage.BEHAVIORAL_ROUND, Pipeline.Stage.ONSITE, Pipeline.Stage.OFFER), 0);

        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.RECRUITER_SCREEN, user.getPipeline(job).getCurrentStage());
        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.HIRING_MANAGER_SCREEN, user.getPipeline(job).getCurrentStage());
        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.TECHNICAL_ROUND, user.getPipeline(job).getCurrentStage());
        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.BEHAVIORAL_ROUND, user.getPipeline(job).getCurrentStage());
        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.ONSITE, user.getPipeline(job).getCurrentStage());
        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.OFFER, user.getPipeline(job).getCurrentStage());
    }

    @Test
    public void testSimpleMoveToStage() throws NoSuchAlgorithmException, IOException {
        User user = client.createUser("yo", "mama", "bruh2000");
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Job job = client.getJob(id);
        client.addApplicant(user, job);
        var stages = List.of(Pipeline.Stage.APPLIED, Pipeline.Stage.RECRUITER_SCREEN, Pipeline.Stage.HIRING_MANAGER_SCREEN, Pipeline.Stage.TECHNICAL_ROUND, Pipeline.Stage.BEHAVIORAL_ROUND, Pipeline.Stage.ONSITE, Pipeline.Stage.OFFER);
        client.updateStages(user, job, stages, 0);

        client.moveToStage(user, job, stages.indexOf(Pipeline.Stage.OFFER));
        Assertions.assertEquals(Pipeline.Stage.OFFER, user.getPipeline(job).getCurrentStage());
    }

    @Test
    public void testMoveToRepeatedStage() throws NoSuchAlgorithmException, IOException {
        User user = client.createUser("yo", "mama", "bruh2000");
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Job job = client.getJob(id);
        client.addApplicant(user, job);
        var stages = List.of(Pipeline.Stage.APPLIED, Pipeline.Stage.TECHNICAL_ROUND, Pipeline.Stage.TECHNICAL_ROUND, Pipeline.Stage.ONSITE, Pipeline.Stage.ONSITE, Pipeline.Stage.OFFER);
        client.updateStages(user, job, stages, 0);

        client.moveToStage(user, job, 1);
        Assertions.assertEquals(Pipeline.Stage.TECHNICAL_ROUND, user.getPipeline(job).getCurrentStage());
        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.TECHNICAL_ROUND, user.getPipeline(job).getCurrentStage());
        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.ONSITE, user.getPipeline(job).getCurrentStage());
        client.moveToNextStage(user, job);
        Assertions.assertEquals(Pipeline.Stage.ONSITE, user.getPipeline(job).getCurrentStage());
    }

    @Test
    public void testMovePastLastStage() throws IOException, NoSuchAlgorithmException {
        User user = client.createUser("yo", "mama", "bruh2000");
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Job job = client.getJob(id);
        client.addApplicant(user, job);
        var stages = List.of(Pipeline.Stage.APPLIED);
        client.updateStages(user, job, stages, 0);

        Assertions.assertThrows(IOException.class, () -> client.moveToNextStage(user, job));
    }

    @Test
    public void testMultipleUsersSameJob_SamePipeline() throws IOException, NoSuchAlgorithmException {
        User user1 = client.createUser("yo", "mama", "bruh2000");
        User user2 = client.createUser("jo", "bama", "bruh3000");
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Job job = client.getJob(id);

        client.addApplicant(user1, job);
        client.addApplicant(user2, job);

        Assertions.assertTrue(client.getApplicants(job).contains(user1));
        Assertions.assertTrue(client.getApplicants(job).contains(user2));

        var stages = List.of(Pipeline.Stage.APPLIED, Pipeline.Stage.TECHNICAL_ROUND, Pipeline.Stage.OFFER);
        client.updateStages(user1, job, stages, 0);
        client.updateStages(user2, job, stages, 0);

        client.moveToNextStage(user1, job);
        Assertions.assertEquals(Pipeline.Stage.TECHNICAL_ROUND, user1.getPipeline(job).getCurrentStage());
        Assertions.assertEquals(Pipeline.Stage.APPLIED, user2.getPipeline(job).getCurrentStage());
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.TECHNICAL_ROUND).contains(user1));
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.APPLIED).contains(user2));

        client.moveToStage(user2, job, 2);
        Assertions.assertEquals(Pipeline.Stage.TECHNICAL_ROUND, user1.getPipeline(job).getCurrentStage());
        Assertions.assertEquals(Pipeline.Stage.OFFER, user2.getPipeline(job).getCurrentStage());
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.TECHNICAL_ROUND).contains(user1));
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.OFFER).contains(user2));

        client.moveToNextStage(user1, job);
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.OFFER).containsAll(Set.of(user1, user2)));

        Assertions.assertEquals(0, client.getApplicantsAtStage(job, Pipeline.Stage.APPLIED).size());
        Assertions.assertEquals(0, client.getApplicantsAtStage(job, Pipeline.Stage.TECHNICAL_ROUND).size());
    }

    @Test
    public void testMultipleUsersSameJob_DifferentPipeline() throws IOException, NoSuchAlgorithmException {
        User user1 = client.createUser("yo", "mama", "bruh2000");
        User user2 = client.createUser("jo", "bama", "bruh3000");
        String id = client.createJob("swe at ass inc", "bumco", "yo mama", "1234");
        Job job = client.getJob(id);

        client.addApplicant(user1, job);
        client.addApplicant(user2, job);

        Assertions.assertTrue(client.getApplicants(job).contains(user1));
        Assertions.assertTrue(client.getApplicants(job).contains(user2));

        var stages1 = List.of(Pipeline.Stage.APPLIED, Pipeline.Stage.TECHNICAL_ROUND, Pipeline.Stage.OFFER);
        client.updateStages(user1, job, stages1, 0);
        var stages2 = List.of(Pipeline.Stage.APPLIED, Pipeline.Stage.TECHNICAL_ROUND, Pipeline.Stage.BEHAVIORAL_ROUND, Pipeline.Stage.OFFER);
        client.updateStages(user2, job, stages2, 0);

        client.moveToNextStage(user1, job);
        Assertions.assertEquals(Pipeline.Stage.TECHNICAL_ROUND, user1.getPipeline(job).getCurrentStage());
        Assertions.assertEquals(Pipeline.Stage.APPLIED, user2.getPipeline(job).getCurrentStage());
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.TECHNICAL_ROUND).contains(user1));
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.APPLIED).contains(user2));

        client.moveToNextStage(user2, job);
        Assertions.assertEquals(Pipeline.Stage.TECHNICAL_ROUND, user1.getPipeline(job).getCurrentStage());
        Assertions.assertEquals(Pipeline.Stage.TECHNICAL_ROUND, user2.getPipeline(job).getCurrentStage());
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.TECHNICAL_ROUND).containsAll(Set.of(user1, user2)));

        client.moveToNextStage(user1, job);
        Assertions.assertEquals(Pipeline.Stage.OFFER, user1.getPipeline(job).getCurrentStage());
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.OFFER).contains(user1));
        Assertions.assertEquals(1, client.getApplicantsAtStage(job, Pipeline.Stage.TECHNICAL_ROUND).size());
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.TECHNICAL_ROUND).contains(user2));

        client.moveToNextStage(user2, job);
        Assertions.assertEquals(Pipeline.Stage.BEHAVIORAL_ROUND, user2.getPipeline(job).getCurrentStage());
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.BEHAVIORAL_ROUND).contains(user2));

        client.moveToNextStage(user2, job);
        Assertions.assertEquals(0, client.getApplicantsAtStage(job, Pipeline.Stage.APPLIED).size());
        Assertions.assertEquals(0, client.getApplicantsAtStage(job, Pipeline.Stage.TECHNICAL_ROUND).size());
        Assertions.assertEquals(0, client.getApplicantsAtStage(job, Pipeline.Stage.BEHAVIORAL_ROUND).size());
        Assertions.assertTrue(client.getApplicantsAtStage(job, Pipeline.Stage.OFFER).containsAll(Set.of(user1, user2)));
    }
}
