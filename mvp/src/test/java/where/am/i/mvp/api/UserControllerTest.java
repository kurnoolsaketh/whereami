package where.am.i.mvp.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// the registries are in-memory singletons, so each test gets a fresh context
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
public class UserControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    public void testCreateUser() throws Exception {
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"firstName": "yo", "lastName": "mama", "userId": "bruh2000"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value("bruh2000"))
                .andExpect(jsonPath("$.firstName").value("yo"))
                .andExpect(jsonPath("$.lastName").value("mama"));
    }

    @Test
    public void testCreateUserAlreadyExists() throws Exception {
        String body = """
                {"firstName": "yo", "lastName": "mama", "userId": "bruh2000"}""";
        mockMvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("User with id [bruh2000] already exists"));
    }

    @Test
    public void testGetUser() throws Exception {
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"firstName": "yo", "lastName": "mama", "userId": "bruh2000"}"""))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/users/bruh2000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value("bruh2000"))
                .andExpect(jsonPath("$.firstName").value("yo"))
                .andExpect(jsonPath("$.lastName").value("mama"));
    }

    @Test
    public void testGetUserNotExists() throws Exception {
        mockMvc.perform(get("/api/users/bruh2000"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No user found with id bruh2000"));
    }
}
