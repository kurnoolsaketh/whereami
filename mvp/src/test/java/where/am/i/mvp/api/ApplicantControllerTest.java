package where.am.i.mvp.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// the registries are in-memory singletons, so each test gets a fresh context
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
public class ApplicantControllerTest {

    private static final String SWE = "Software Engineer";
    private static final String PM = "Product Manager";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    String jobId;

    @BeforeEach
    public void setup() throws Exception {
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"firstName": "yo", "lastName": "mama", "userId": "bruh2000"}"""))
                .andExpect(status().isOk());
        jobId = createJob("swe", "bumco", SWE);
    }

    private String createJob(String title, String company, String role) throws Exception {
        String response = mockMvc.perform(post("/api/jobs/%s/new".formatted(company))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "%s", "url": "https://%s.example/%s", "role": "%s"}"""
                                .formatted(title, company, title, role)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("jobId").asString();
    }

    // a level goes out and comes back as its display name, so "Senior", never "SENIOR"
    private void apply(String userId, String jobId) throws Exception {
        mockMvc.perform(post("/api/users/%s/apply".formatted(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s", "level": "Senior"}""".formatted(jobId)))
                .andExpect(status().isOk());
    }

    @Test
    public void testApplicationsIsEmptyBeforeApplying() throws Exception {
        mockMvc.perform(get("/api/users/bruh2000/applied"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testApplicationsForUnknownUser() throws Exception {
        mockMvc.perform(get("/api/users/nobody/applied"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No user found with id nobody"));
    }

    @Test
    public void testApplyStartsAtApplied() throws Exception {
        mockMvc.perform(post("/api/users/bruh2000/apply")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s", "level": "Senior"}""".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.job.jobId").value(jobId))
                .andExpect(jsonPath("$.job.role").value("Software Engineer"))
                .andExpect(jsonPath("$.pipeline.stages.length()").value(1))
                .andExpect(jsonPath("$.pipeline.stages[0]").value("APPLIED"))
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(0))
                .andExpect(jsonPath("$.pipeline.level").value("Senior"))
                .andExpect(jsonPath("$.pipeline.jobId").value(jobId))
                .andExpect(jsonPath("$.pipeline.status").value("ACTIVE"));

        mockMvc.perform(get("/api/users/bruh2000/applied"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].job.jobId").value(jobId))
                .andExpect(jsonPath("$[0].job.title").value("swe"))
                .andExpect(jsonPath("$[0].pipeline.stages[0]").value("APPLIED"))
                .andExpect(jsonPath("$[0].pipeline.currentStagePosition").value(0));
    }

    @Test
    public void testApplyToUnknownJob() throws Exception {
        mockMvc.perform(post("/api/users/bruh2000/apply")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s", "level": "Senior"}""".formatted("x".repeat(64))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job [%s] does not exist".formatted("x".repeat(64))));
    }

    @Test
    public void testApplicationsSortByCompanyThenTitle() throws Exception {
        apply("bruh2000", createJob("swe", "zebra", SWE));
        apply("bruh2000", createJob("tpm", "acme", PM));
        apply("bruh2000", createJob("designer", "acme", SWE));

        mockMvc.perform(get("/api/users/bruh2000/applied"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].job.company").value("acme"))
                .andExpect(jsonPath("$[0].job.title").value("designer"))
                .andExpect(jsonPath("$[1].job.company").value("acme"))
                .andExpect(jsonPath("$[1].job.title").value("tpm"))
                .andExpect(jsonPath("$[2].job.company").value("zebra"))
                .andExpect(jsonPath("$[2].job.title").value("swe"));
    }

    @Test
    public void testWithdraw() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(delete("/api/users/bruh2000/applied/" + jobId))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/users/bruh2000/applied"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testUpdateStages() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED", "TECHNICAL_ROUND", "TECHNICAL_ROUND", "ONSITE"],
                                 "currentStagePosition": 2}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.stages.length()").value(4))
                .andExpect(jsonPath("$.pipeline.stages[1]").value("TECHNICAL_ROUND"))
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(2));
    }

    @Test
    public void testUpdateStagesRejectsListNotStartingWithApplied() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["ONSITE", "TECHNICAL_ROUND"], "currentStagePosition": 0}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("First stage must be [APPLIED]. Actual: [ONSITE]"));

        mockMvc.perform(get("/api/users/bruh2000/applied"))
                .andExpect(jsonPath("$[0].pipeline.stages[0]").value("APPLIED"))
                .andExpect(jsonPath("$[0].pipeline.stages.length()").value(1));
    }

    @Test
    public void testUpdateStagesRejectsPositionPastTheNewList() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED", "ONSITE"], "currentStagePosition": 5}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid position [5] - max [1]"));
    }

    @Test
    public void testMoveToStage() throws Exception {
        apply("bruh2000", jobId);
        setStages("APPLIED", "TECHNICAL_ROUND", "ONSITE");

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/moveToStage".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentStagePosition": 2}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(2))
                .andExpect(jsonPath("$.pipeline.stages.length()").value(3));
    }

    @Test
    public void testMoveToStagePastTheList() throws Exception {
        apply("bruh2000", jobId);
        setStages("APPLIED", "TECHNICAL_ROUND", "ONSITE");

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/moveToStage".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentStagePosition": 3}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid position [3] - max [2]"));
    }

    @Test
    public void testMoveToNextStage() throws Exception {
        apply("bruh2000", jobId);
        setStages("APPLIED", "TECHNICAL_ROUND", "ONSITE");

        mockMvc.perform(post("/api/users/bruh2000/applied/%s/moveToNextStage".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(1));

        mockMvc.perform(post("/api/users/bruh2000/applied/%s/moveToNextStage".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(2));
    }

    @Test
    public void testMoveToNextStagePastTheLastOne() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(post("/api/users/bruh2000/applied/%s/moveToNextStage".formatted(jobId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid position [1] - max [0]"));
    }

    // the user has applications, just not to this job
    @Test
    public void testMovingAJobTheUserNeverAppliedTo() throws Exception {
        apply("bruh2000", jobId);
        String other = createJob("pm", "bumco", PM);

        mockMvc.perform(post("/api/users/bruh2000/applied/%s/moveToNextStage".formatted(other)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("User has not applied to the [PRODUCT_MANAGER] role at [bumco] or has been removed"));
    }

    // no applications at all, which is a different branch with its own message
    @Test
    public void testMovingWhenTheUserHasAppliedToNothing() throws Exception {
        mockMvc.perform(post("/api/users/bruh2000/applied/%s/moveToNextStage".formatted(jobId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("User [bruh2000] has not applied to any jobs - can't move to next stage"));
    }

    // the whole point of splitting Stage from Status: an outcome is recorded alongside the
    // stage list, never by truncating or appending to it. the stages and the position coming
    // back unchanged is the assertion that keeps that true
    @Test
    public void testUpdateStatusRecordsAnOutcomeWithoutTouchingStages() throws Exception {
        apply("bruh2000", jobId);
        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED", "TECHNICAL_ROUND", "ONSITE"],
                                 "currentStagePosition": 1}"""))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStatus".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newStatus": "REJECTED"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.status").value("REJECTED"))
                .andExpect(jsonPath("$.pipeline.stages.length()").value(3))
                .andExpect(jsonPath("$.pipeline.stages[1]").value("TECHNICAL_ROUND"))
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(1));

        mockMvc.perform(get("/api/users/bruh2000/applied"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].pipeline.status").value("REJECTED"))
                .andExpect(jsonPath("$[0].pipeline.stages.length()").value(3))
                .andExpect(jsonPath("$[0].pipeline.currentStagePosition").value(1));
    }

    // reopening is just another status change, so it costs nothing and restores nothing -
    // there was never any stage data to put back
    @Test
    public void testUpdateStatusReopens() throws Exception {
        apply("bruh2000", jobId);
        setStatus("USER_WITHDREW");
        setStatus("OFFER");

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStatus".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newStatus": "ACTIVE"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.status").value("ACTIVE"))
                .andExpect(jsonPath("$.pipeline.stages.length()").value(1))
                .andExpect(jsonPath("$.pipeline.stages[0]").value("APPLIED"));
    }

    @Test
    public void testUpdateStatusForUnknownUser() throws Exception {
        mockMvc.perform(put("/api/users/nobody/applied/%s/updateStatus".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newStatus": "REJECTED"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No user found with id nobody"));
    }

    @Test
    public void testUpdateStatusForUnknownJob() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStatus".formatted("x".repeat(64)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newStatus": "REJECTED"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job [%s] does not exist".formatted("x".repeat(64))));
    }

    // the user exists and has applications, just not to this job
    @Test
    public void testUpdateStatusOnAJobTheUserNeverAppliedTo() throws Exception {
        apply("bruh2000", jobId);
        String other = createJob("pm", "bumco", PM);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStatus".formatted(other))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newStatus": "REJECTED"}"""))
                .andExpect(status().isBadRequest())
                // the message interpolates Job's record toString, which is not worth pinning
                .andExpect(jsonPath("$.message", startsWith("User [bruh2000] has not applied to job")));
    }

    // --- the status work, hardened ---

    @Test
    public void testUpdateStatusRejectsANullStatus() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStatus".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newStatus": null}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("newStatus is required"));

        // and the application is untouched, not left holding a null status
        mockMvc.perform(get("/api/users/bruh2000/applied"))
                .andExpect(jsonPath("$[0].pipeline.status").value("ACTIVE"));
    }

    @Test
    public void testUpdateStatusRejectsAnEmptyBody() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStatus".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("newStatus is required"));
    }

    // an unparseable enum is rejected by Spring before the controller runs, so this exercises
    // ApiExceptionHandler's second handler rather than any validation of ours. what matters is
    // that it still arrives as an ErrorResponse - the frontend reads `message` and nothing else
    @Test
    public void testUnknownStatusStillCarriesAMessage() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStatus".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newStatus": "BOGUS"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    // the same handler covers every unparseable body, not just statuses
    @Test
    public void testUnknownStageAndLevelAlsoCarryAMessage() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED", "INTERPRETIVE_DANCE"], "currentStagePosition": 0}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());

        mockMvc.perform(post("/api/users/bruh2000/apply")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s", "level": "Overlord"}""".formatted(jobId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    // an application that ended is a record of what happened, so its rounds stop moving
    @Test
    public void testStageChangesAreRefusedOnATerminatedPipeline() throws Exception {
        apply("bruh2000", jobId);
        setStages("APPLIED", "TECHNICAL_ROUND", "ONSITE");
        setStatus("REJECTED");

        mockMvc.perform(post("/api/users/bruh2000/applied/%s/moveToNextStage".formatted(jobId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", startsWith("Cannot move an application that ended with [REJECTED]")));

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/moveToStage".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentStagePosition": 2}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", startsWith("Cannot move an application that ended with [REJECTED]")));

        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED"], "currentStagePosition": 0}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message",
                        startsWith("Cannot change the stages of an application that ended with [REJECTED]")));
    }

    // ...and reopening lifts the guard, with the stage list intact through the whole round trip
    @Test
    public void testReopeningRestoresStageChangesWithTheListIntact() throws Exception {
        apply("bruh2000", jobId);
        setStages("APPLIED", "TECHNICAL_ROUND", "ONSITE");
        setStatus("OFFER");
        setStatus("ACTIVE");

        mockMvc.perform(post("/api/users/bruh2000/applied/%s/moveToNextStage".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.status").value("ACTIVE"))
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(1))
                // the rounds survived being ended and reopened, because neither touched them
                .andExpect(jsonPath("$.pipeline.stages.length()").value(3))
                .andExpect(jsonPath("$.pipeline.stages[0]").value("APPLIED"))
                .andExpect(jsonPath("$.pipeline.stages[1]").value("TECHNICAL_ROUND"))
                .andExpect(jsonPath("$.pipeline.stages[2]").value("ONSITE"));
    }

    private void setStatus(String status) throws Exception {
        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStatus".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newStatus": "%s"}""".formatted(status)))
                .andExpect(status().isOk());
    }

    private void setStages(String... stages) throws Exception {
        String quoted = String.join(", ", java.util.Arrays.stream(stages).map("\"%s\""::formatted).toList());
        mockMvc.perform(put("/api/users/bruh2000/applied/%s/updateStages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": [%s], "currentStagePosition": 0}""".formatted(quoted)))
                .andExpect(status().isOk());
    }
}
