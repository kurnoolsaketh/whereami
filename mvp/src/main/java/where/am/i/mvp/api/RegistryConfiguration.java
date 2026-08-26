package where.am.i.mvp.api;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import where.am.i.mvp.server.CompanyRegistry;
import where.am.i.mvp.server.JobRegistry;
import where.am.i.mvp.server.ApplicantService;
import where.am.i.mvp.server.UserRegistry;

// the registries hold everything in memory, so the whole app shares one of each
@Configuration
public class RegistryConfiguration {

    @Bean
    public ApplicantService pipelineService() {
        return new ApplicantService();
    }

    @Bean
    public JobRegistry jobRegistry() {
        return new JobRegistry();
    }

    @Bean
    public UserRegistry userRegistry() {
        return new UserRegistry();
    }

    @Bean
    public CompanyRegistry companyRegistry() {
        return new CompanyRegistry();
    }
}
