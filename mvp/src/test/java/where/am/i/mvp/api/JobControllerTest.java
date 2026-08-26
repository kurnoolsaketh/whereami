package where.am.i.mvp.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// the registries are in-memory singletons, so each test gets a fresh context
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
public class JobControllerTest {

    // a role travels as its display name, so it carries a space and has to be url-encoded in a
    // path. passing it as a uri variable lets MockMvc do that encoding
    private static final String SWE = "Software Engineer";
    private static final String PM = "Product Manager";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

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

    @Test
    public void testCreateJob() throws Exception {
        mockMvc.perform(post("/api/jobs/bumco/new")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "swe", "url": "https://bumco.example/jobs/1234", "role": "Software Engineer"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").isString())
                .andExpect(jsonPath("$.title").value("swe"))
                .andExpect(jsonPath("$.company").value("bumco"))
                .andExpect(jsonPath("$.url").value("https://bumco.example/jobs/1234"))
                .andExpect(jsonPath("$.role").value("Software Engineer"));
    }

    @Test
    public void testCreateJobMissingUrl() throws Exception {
        mockMvc.perform(post("/api/jobs/bumco/new")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "swe", "role": "Software Engineer"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("url is required"));
    }

    // no scheme, so URI parses it and toURL rejects it as not absolute
    @Test
    public void testCreateJobMalformedUrl() throws Exception {
        mockMvc.perform(post("/api/jobs/bumco/new")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "swe", "url": "bumco.example/jobs", "role": "Software Engineer"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isString());
    }

    // JobRegistry no longer rejects a duplicate: the id is a hash of every field that would have
    // to differ, so creating the same job twice overwrites the one entry in place
    @Test
    public void testCreatingTheSameJobTwiceYieldsOneEntry() throws Exception {
        String first = createJob("swe", "bumco", SWE);
        String second = createJob("swe", "bumco", SWE);

        assertEquals(first, second);
        mockMvc.perform(get("/api/jobs/bumco/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    public void testGetJob() throws Exception {
        String jobId = createJob("swe", "bumco", SWE);

        mockMvc.perform(get("/api/jobs/" + jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value(jobId))
                .andExpect(jsonPath("$.title").value("swe"))
                .andExpect(jsonPath("$.company").value("bumco"))
                .andExpect(jsonPath("$.url").value("https://bumco.example/swe"))
                .andExpect(jsonPath("$.role").value("Software Engineer"));
    }

    @Test
    public void testGetJobNotExists() throws Exception {
        mockMvc.perform(get("/api/jobs/" + "x".repeat(64)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job [%s] does not exist".formatted("x".repeat(64))));
    }

    @Test
    public void testGetJobMalformedId() throws Exception {
        mockMvc.perform(get("/api/jobs/x"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job id [x] is malformed - it must be 64 bytes"));
    }

    @Test
    public void testListJobsIsEmptyBeforeAnyAreCreated() throws Exception {
        mockMvc.perform(get("/api/jobs/bumco/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    // listing is per company now, so only the title ordering is observable in one call
    @Test
    public void testListJobsForCompanySortsByTitle() throws Exception {
        createJob("tpm", "acme", PM);
        createJob("designer", "acme", SWE);
        createJob("swe", "zebra", SWE);          // other company, excluded

        mockMvc.perform(get("/api/jobs/acme/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].title").value("designer"))
                .andExpect(jsonPath("$[1].title").value("tpm"));
    }

    @Test
    public void testListJobsForUnknownCompanyIsEmpty() throws Exception {
        createJob("swe", "acme", SWE);

        mockMvc.perform(get("/api/jobs/ghost/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testListJobsForCompanyAndRole() throws Exception {
        createJob("swe", "acme", SWE);
        createJob("tpm", "acme", PM);

        mockMvc.perform(get("/api/jobs/{company}/{role}/list", "acme", SWE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("swe"))
                .andExpect(jsonPath("$[0].role").value("Software Engineer"));
    }

    @Test
    public void testListCompanies() throws Exception {
        createJob("swe", "zebra", SWE);
        createJob("tpm", "acme", PM);

        mockMvc.perform(get("/api/jobs/companies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0]").value("acme"))
                .andExpect(jsonPath("$[1]").value("zebra"));
    }
}
