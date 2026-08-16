package where.am.i.mvp.api;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import where.am.i.mvp.server.JobRegistry;
import where.am.i.mvp.server.PipelineService;
import where.am.i.mvp.server.UserRegistry;

// the registries hold everything in memory, so the whole app shares one of each
@Configuration
public class RegistryConfiguration {

    @Bean
    public PipelineService pipelineService() {
        return new PipelineService();
    }

    @Bean
    public JobRegistry jobRegistry(PipelineService pipelineService) {
        return new JobRegistry(pipelineService);
    }

    @Bean
    public UserRegistry userRegistry() {
        return new UserRegistry();
    }
}
