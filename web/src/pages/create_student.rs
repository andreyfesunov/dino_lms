use topcoat::{
    Result,
    router::{
        error::{SeeOther, see_other},
        route,
    },
};

/// Legacy create-student routes — redirect to the users admin screen.
#[route(GET "/students/new")]
async fn create_student_redirect() -> Result<SeeOther> {
    Ok(see_other("/users"))
}

#[route(POST "/students")]
async fn create_student_post_redirect() -> Result<SeeOther> {
    Ok(see_other("/users"))
}
